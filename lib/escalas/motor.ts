/**
 * Motor das escalas — regras, compensações, conformidade e sugestão automática.
 * Puro (sem I/O): corre no browser para a interface e no servidor para validar escritas.
 *
 * HARD  = nunca se grava (também garantido na base de dados).
 * SOFT  = aviso; a coordenação pode forçar com justificação.
 */
import { addDays, dRange, dow, fmt, fmtFull, isWE, mondayOf } from "./datas";
import type {
  Ausencia,
  Aviso,
  Dataset,
  EstadoAusencia,
  Feriado,
  Grupo,
  Origem,
  Periodo,
  Pessoa,
  RegraCodigo,
  Regras,
  Slot,
  TipoDia,
  Turno,
  Verificacao,
} from "./tipos";
import { TIPO_LABEL } from "./tipos";

export interface VerificacaoPeriodo {
  na?: boolean;
  c: Record<Periodo, number>;
  m: Partial<Record<Periodo, number>>;
  ok: boolean;
}

export interface Obrigacao {
  tipo: "FDS" | "PIQ";
  need: number;
  ini: string;
  fim: string;
  soUteis: boolean;
  label: string;
  dias: string[];
}

export interface SaldoCompensacao {
  obl: Obrigacao[];
  dev: number;
  got: number;
  falta: number;
}

export interface Proposta {
  data: string;
  slotId: string;
  pessoaId: string;
  grupoId: string;
  soft: Aviso[];
  razao: string;
}

export interface Lacuna {
  data: string;
  slotId: string;
  grupoId: string;
  falta: number;
  motivo: string;
}

export interface EstatPessoa {
  t: number;
  h: number;
  M: number;
  T: number;
  N: number;
  piq: number;
  fds: number;
  exc: number;
  maxRun: number;
  abs: number;
}

export interface Alerta {
  k: "bad" | "warn";
  texto: string;
}

export interface ItemAtribuir {
  data: string;
  slotId: string;
  pessoaId: string;
  origem?: Origem;
  justificacao?: string;
}

export interface ItemRetirar {
  data: string;
  pessoaId: string;
}

export interface ResultadoLote {
  ok: boolean;
  erros: { data: string; pessoaId: string; slotId?: string; motivo: string; soft?: Aviso[] }[];
  atribuir: (ItemAtribuir & { excecaoRegras: RegraCodigo[] })[];
  retirar: ItemRetirar[];
}

type Sim = Record<string, Record<string, string | null>>;

export class Motor {
  readonly ds: Dataset;
  readonly regras: Regras;
  readonly periodos: Record<Periodo, string>;
  /** Todos os slots (inclui inativos, para mostrar histórico). */
  readonly slotMap: Map<string, Slot>;
  /** Slots ativos, por hora de início. */
  readonly slots: Slot[];
  readonly grupoMap: Map<string, Grupo>;
  /** Grupos ativos, por ordem. */
  readonly grupos: Grupo[];
  readonly pessoaMap: Map<string, Pessoa>;
  /** Pessoas ativas, por nome. */
  readonly pessoas: Pessoa[];
  private readonly feriadoMap: Map<string, Feriado>;
  private readonly shift: Map<string, Map<string, Turno>>;
  private readonly abs: Map<string, Ausencia[]>;
  private readonly dem: Map<string, [number, number]>;
  private readonly demDia: Map<string, [number, number]>;
  private sim: Sim | null = null;

  constructor(ds: Dataset) {
    this.ds = ds;
    this.regras = ds.regras;
    this.periodos = ds.periodos;
    this.slotMap = new Map(ds.slots.map((s) => [s.id, s]));
    this.slots = ds.slots.filter((s) => s.ativo).sort((a, b) => a.inicioMin - b.inicioMin || a.ordem - b.ordem);
    this.grupoMap = new Map(ds.grupos.map((g) => [g.id, g]));
    this.grupos = ds.grupos.filter((g) => g.ativo).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt"));
    this.pessoaMap = new Map(ds.pessoas.map((p) => [p.id, p]));
    this.pessoas = ds.pessoas.filter((p) => p.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    this.feriadoMap = new Map(ds.feriados.map((f) => [f.data, f]));
    this.shift = new Map();
    for (const t of ds.turnos) {
      let m = this.shift.get(t.data);
      if (!m) this.shift.set(t.data, (m = new Map()));
      m.set(t.pessoaId, t);
    }
    this.abs = new Map();
    for (const a of ds.ausencias) {
      const l = this.abs.get(a.pessoaId) ?? [];
      l.push(a);
      this.abs.set(a.pessoaId, l);
    }
    this.dem = new Map(ds.necessidades.map((n) => [`${n.grupoId}|${n.tipoDia}|${n.slotId}`, [n.minimo, n.maximo]]));
    this.demDia = new Map(ds.necessidadesDia.map((n) => [`${n.data}|${n.grupoId}|${n.slotId}`, [n.minimo, n.maximo]]));
  }

  // ---------------------------------------------------------------- básicos
  slot(id: string) {
    return this.slotMap.get(id);
  }
  grupo(id: string | null | undefined) {
    return id ? this.grupoMap.get(id) : undefined;
  }
  pessoa(id: string) {
    return this.pessoaMap.get(id);
  }
  nomeGrupo(id: string | null | undefined) {
    return (id && this.grupoMap.get(id)?.nome) || id || "—";
  }
  membros(g: string) {
    return this.pessoas.filter((p) => p.grupoId === g);
  }
  feriado(d: string) {
    return this.feriadoMap.get(d);
  }
  /** Dia útil: nem fim de semana nem feriado. */
  diaUtil(d: string) {
    return !isWE(d) && !this.feriadoMap.has(d);
  }
  tipoDia(d: string): TipoDia {
    return isWE(d) || (this.regras.feriadoComoFds && this.feriadoMap.has(d)) ? "FDS" : "SEMANA";
  }
  diasUteis(dias: string[]) {
    return dias.filter((d) => this.diaUtil(d)).length;
  }
  prefTxt(p: Pessoa) {
    return p.periodos.map((x) => this.periodos[x] || x).join("/") + (p.fazFds ? " + FDS" : "");
  }

  demanda(g: string, d: string, sid: string): [number, number] {
    return this.demDia.get(`${d}|${g}|${sid}`) ?? this.dem.get(`${g}|${this.tipoDia(d)}|${sid}`) ?? [0, 0];
  }
  isOverride(g: string, d: string, sid: string) {
    return this.demDia.has(`${d}|${g}|${sid}`);
  }
  temDemandaDia(g: string, d: string) {
    return this.slots.some((s) => this.demanda(g, d, s.id)[0] > 0);
  }

  // ---------------------------------------------------------------- turnos e ausências
  turnoDe(u: string, d: string): string | null {
    const s = this.sim?.[d];
    if (s && u in s) return s[u];
    return this.shift.get(d)?.get(u)?.slotId ?? null;
  }
  entradaDe(u: string, d: string): Turno | null {
    return this.shift.get(d)?.get(u) ?? null;
  }
  turnosDoDia(d: string): Turno[] {
    return [...(this.shift.get(d)?.values() ?? [])];
  }
  ausencias(u: string) {
    return this.abs.get(u) ?? [];
  }
  ausenciaEm(u: string, d: string, estado: EstadoAusencia) {
    return this.ausencias(u).find((a) => a.estado === estado && d >= a.inicio && d <= a.fim) ?? null;
  }
  private descansoEntre(a: string, b: string) {
    return 1440 + this.slotMap.get(b)!.inicioMin - this.slotMap.get(a)!.fimMin;
  }

  /** Executa fn com alterações simuladas (u,d → slot ou null). */
  comSimulacao<T>(mud: { u: string; d: string; s: string | null }[], fn: () => T): T {
    const prev = this.sim;
    const next: Sim = { ...(prev ?? {}) };
    for (const { u, d, s } of mud) next[d] = { ...(next[d] ?? {}), [u]: s };
    this.sim = next;
    try {
      return fn();
    } finally {
      this.sim = prev;
    }
  }
  /** Aplica uma alteração à simulação persistente (usada por motores e validação em lote). */
  private simular(u: string, d: string, s: string | null) {
    this.sim = this.sim ?? {};
    this.sim[d] = { ...(this.sim[d] ?? {}), [u]: s };
  }

  // ---------------------------------------------------------------- regras
  hardOf(u: string, d: string, sid: string): string[] {
    const p = this.pessoaMap.get(u);
    const s = this.slotMap.get(sid);
    const out: string[] = [];
    if (!p || !p.ativo) return ["Pessoa inativa"];
    if (!s || !s.ativo) return ["Slot inexistente ou inativo"];
    if (!p.periodos.includes(s.periodo)) out.push(`Preferência (${this.prefTxt(p)}) não inclui ${this.periodos[s.periodo]}`);
    const ab = this.ausenciaEm(u, d, "APROVADA");
    if (ab) out.push(`${TIPO_LABEL[ab.tipo]} ${ab.tipo === "FERIAS" ? "aprovadas" : "aprovada"} (${fmt(ab.inicio)}–${fmt(ab.fim)})`);
    const j = this.turnoDe(u, d);
    if (j === sid) out.push("Já está neste slot");
    else if (j) out.push(`Já tem ${this.slotMap.get(j)?.etiqueta ?? j} neste dia`);
    return out;
  }

  sequencia(u: string, d: string) {
    let n = 1;
    let c = addDays(d, -1);
    for (let k = 0; this.turnoDe(u, c) && k < 60; k++, c = addDays(c, -1)) n++;
    c = addDays(d, 1);
    for (let k = 0; this.turnoDe(u, c) && k < 60; k++, c = addDays(c, 1)) n++;
    return n;
  }

  folgasPior(u: string, d: string) {
    const N = Math.max(1, this.regras.janelaFolgas | 0);
    const arr: number[] = [];
    for (let i = -(N - 1); i <= N - 1; i++) arr.push(this.turnoDe(u, addDays(d, i)) ? 1 : 0);
    let worst = 99;
    let wi = 0;
    for (let s = 0; s < N; s++) {
      let w = 0;
      for (let k = 0; k < N; k++) w += arr[s + k];
      if (N - w < worst) {
        worst = N - w;
        wi = s;
      }
    }
    const ini = addDays(d, wi - (N - 1));
    return { livres: worst, ini, fim: addDays(ini, N - 1) };
  }

  horasSemana(u: string, d: string) {
    const m = mondayOf(d);
    let h = 0;
    for (let i = 0; i < 7; i++) {
      const s = this.turnoDe(u, addDays(m, i));
      if (s) h += this.slotMap.get(s)?.horas ?? 0;
    }
    return Math.round(h * 10) / 10;
  }

  piqueteSequencia(u: string, d: string) {
    const isP = (x: string) => {
      const s = this.turnoDe(u, x);
      return !!(s && this.slotMap.get(s)?.piquete);
    };
    if (!isP(d)) return 0;
    let n = 1;
    let c = addDays(d, -1);
    for (let k = 0; isP(c) && k < 60; k++, c = addDays(c, -1)) n++;
    c = addDays(d, 1);
    for (let k = 0; isP(c) && k < 60; k++, c = addDays(c, 1)) n++;
    return n;
  }

  verificar(u: string, d: string, sid: string): Verificacao {
    const hard = this.hardOf(u, d, sid);
    const soft: Aviso[] = [];
    if (hard.length) return { hard, soft };
    const p = this.pessoaMap.get(u)!;
    const s = this.slotMap.get(sid)!;
    const st = this.regras;
    const W = (code: RegraCodigo, message: string) => soft.push({ code, message });
    if (isWE(d) && !p.fazFds) W("SEM_FDS", "Não tem fim de semana na preferência");
    if (!isWE(d) && p.soFds) W("SO_FDS", "Preferência apenas para fins de semana");
    const pd = this.ausenciaEm(u, d, "PENDENTE");
    if (pd) W("PENDENTE", `Tem pedido de ${TIPO_LABEL[pd.tipo].toLowerCase()} pendente para este dia`);
    const minDescanso = st.descansoMinimoHoras * 60;
    const prev = this.turnoDe(u, addDays(d, -1));
    if (prev && this.slotMap.get(prev)) {
      const g = this.descansoEntre(prev, sid);
      if (g < minDescanso)
        W("DESCANSO", `Só ${Math.floor(g / 60)}h de descanso após ${this.slotMap.get(prev)!.etiqueta} de ${fmt(addDays(d, -1))} (mín. ${st.descansoMinimoHoras}h)`);
    }
    const nx = this.turnoDe(u, addDays(d, 1));
    if (nx && this.slotMap.get(nx)) {
      const g = this.descansoEntre(sid, nx);
      if (g < minDescanso)
        W("DESCANSO", `Só ${Math.floor(g / 60)}h antes de ${this.slotMap.get(nx)!.etiqueta} de ${fmt(addDays(d, 1))} (mín. ${st.descansoMinimoHoras}h)`);
    }
    this.comSimulacao([{ u, d, s: sid }], () => {
      const run = this.sequencia(u, d);
      if (run > st.maxDiasConsecutivos) W("DIAS_SEGUIDOS", `Passa a ${run} dias seguidos de trabalho (máx. ${st.maxDiasConsecutivos})`);
      const fw = this.folgasPior(u, d);
      if (fw.livres < st.folgasMinimas)
        W("FOLGAS", `Apenas ${fw.livres} folgas entre ${fmt(fw.ini)} e ${fmt(fw.fim)} (mín. ${st.folgasMinimas} em ${st.janelaFolgas} dias)`);
      const hs = this.horasSemana(u, d);
      if (hs > st.maxHorasSemanais) W("HORAS", `${hs}h nesta semana (máx. ${st.maxHorasSemanais}h)`);
      if (s.piquete) {
        const pr = this.piqueteSequencia(u, d);
        if (pr > st.piqueteDiasSeguidos) W("PIQUETE", `${pr} dias seguidos de piquete (acima de ${st.piqueteDiasSeguidos})`);
      }
    });
    return { hard, soft };
  }

  disponiveis(d: string, sid: string, g: string) {
    return this.membros(g).filter((p) => this.hardOf(p.id, d, sid).length === 0);
  }
  atribuidos(d: string, sid: string, g: string) {
    return this.membros(g).filter((p) => this.turnoDe(p.id, d) === sid);
  }

  /** Mínimo por período de um grupo (inclui quem o "integra" à semana). */
  verificarPeriodo(g: string, d: string): VerificacaoPeriodo | null {
    const m = this.grupoMap.get(g)?.minimos;
    if (!m || !Object.values(m).some((v) => (v ?? 0) > 0)) return null;
    const c: Record<Periodo, number> = { M: 0, T: 0, N: 0 };
    if (this.regras.minimoPeriodoSoSemana && !this.diaUtil(d)) return { na: true, c, m, ok: true };
    for (const p of this.pessoas) {
      if (!(p.grupoId === g || (p.integraGrupoId === g && !isWE(d)))) continue;
      const s = this.turnoDe(p.id, d);
      const sl = s ? this.slotMap.get(s) : undefined;
      if (sl) c[sl.periodo]++;
    }
    return { c, m, ok: (Object.keys(m) as Periodo[]).every((k) => c[k] >= (m[k] ?? 0)) };
  }

  paresAlternancia(): [string, string][] {
    const seen = new Set<string>();
    const out: [string, string][] = [];
    for (const p of this.pessoas) {
      const o = p.alternaCom ? this.pessoaMap.get(p.alternaCom) : undefined;
      if (o && o.ativo && !seen.has(p.id)) {
        seen.add(p.id);
        seen.add(o.id);
        out.push([p.id, o.id]);
      }
    }
    return out;
  }
  private diaPlaneado(g: string, d: string) {
    return this.membros(g).some((p) => this.turnoDe(p.id, d));
  }
  violacoesAlternancia(from: string, to: string) {
    const out: { a: string; b: string; d: string }[] = [];
    for (const [a, b] of this.paresAlternancia()) {
      const g = this.pessoaMap.get(a)!.grupoId;
      for (const d of dRange(from, to)) {
        if (!this.temDemandaDia(g, d) || !this.diaPlaneado(g, d)) continue;
        if (!this.turnoDe(a, d) && !this.turnoDe(b, d)) out.push({ a, b, d });
      }
    }
    return out;
  }
  conflitoAlternancia(a: Pick<Ausencia, "id" | "pessoaId" | "inicio" | "fim">) {
    const p = this.pessoaMap.get(a.pessoaId);
    const par = p?.alternaCom ? this.pessoaMap.get(p.alternaCom) : undefined;
    if (!par) return null;
    const x = this.ausencias(par.id).find((o) => o.id !== a.id && o.estado === "APROVADA" && !(o.fim < a.inicio || o.inicio > a.fim));
    return x ? { par, abs: x } : null;
  }

  // ---------------------------------------------------------------- compensações e férias
  /**
   * Fins de semana trabalhados e blocos de piquete geram folgas devidas. Cada obrigação tem
   * uma janela e é servida pelos dias livres mais cedo; um dia livre só serve uma obrigação.
   */
  saldoCompensacao(u: string, from: string, to: string): SaldoCompensacao {
    const st = this.regras;
    const obl: Obrigacao[] = [];
    const weeks: { m: string; worked: boolean }[] = [];
    for (let m = mondayOf(from); m <= to; m = addDays(m, 7))
      weeks.push({ m, worked: !!(this.turnoDe(u, addDays(m, 5)) || this.turnoDe(u, addDays(m, 6))) });
    let i = 0;
    while (i < weeks.length) {
      if (!weeks[i].worked) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < weeks.length && weeks[j + 1].worked) j++;
      const len = j - i + 1;
      const seq = len >= st.fdsSequenciaMin;
      for (let k = i; k <= j; k++) {
        const need = seq ? st.fdsFolgasSequencia : st.fdsFolgasNormal;
        if (need > 0)
          obl.push({
            tipo: "FDS",
            need,
            ini: weeks[k].m,
            fim: addDays(weeks[k].m, 11),
            soUteis: true,
            label: `Fim de semana de ${fmt(addDays(weeks[k].m, 5))}` + (seq ? ` · sequência de ${len}` : ""),
            dias: [],
          });
      }
      i = j + 1;
    }
    let run: { ini: string; fim: string; len: number } | null = null;
    const flush = () => {
      if (!run) return;
      const n = Math.floor(run.len / Math.max(1, st.piqueteDiasSeguidos));
      if (n > 0 && run.fim >= from)
        obl.push({
          tipo: "PIQ",
          need: n * st.piqueteFolgas,
          ini: addDays(run.ini, -7),
          fim: addDays(run.fim, 7),
          soUteis: false,
          label: `Piquete de ${fmt(run.ini)} a ${fmt(run.fim)} (${run.len} dias)`,
          dias: [],
        });
      run = null;
    };
    for (const d of dRange(addDays(from, -21), to)) {
      const s = this.turnoDe(u, d);
      if (s && this.slotMap.get(s)?.piquete) {
        if (!run) run = { ini: d, fim: d, len: 0 };
        run.len++;
        run.fim = d;
      } else flush();
    }
    flush();
    obl.sort((a, b) => a.ini.localeCompare(b.ini));
    const used = new Set<string>();
    let dev = 0;
    let got = 0;
    for (const o of obl) {
      for (const d of dRange(o.ini, o.fim)) {
        if (o.dias.length >= o.need) break;
        if (o.soUteis && !this.diaUtil(d)) continue;
        if (used.has(d) || this.turnoDe(u, d)) continue;
        const ab = this.ausenciaEm(u, d, "APROVADA");
        if (ab && ab.tipo !== "FOLGA") continue;
        used.add(d);
        o.dias.push(d);
      }
      dev += o.need;
      got += o.dias.length;
    }
    return { obl, dev, got, falta: dev - got };
  }

  feriasSaldo(u: string, ano: string) {
    return this.pessoaMap.get(u)?.feriasSaldo[ano] ?? this.regras.feriasDiasAno;
  }
  /** Dias úteis de férias aprovadas no ano (exclui fins de semana e feriados). */
  feriasUsadas(u: string, ano: string) {
    return this.ausencias(u)
      .filter((a) => a.tipo === "FERIAS" && a.estado === "APROVADA")
      .reduce((n, a) => n + dRange(a.inicio, a.fim).filter((d) => d.startsWith(ano) && this.diaUtil(d)).length, 0);
  }

  // ---------------------------------------------------------------- estatísticas
  estatSemana(g: string, ws: string) {
    const from = addDays(ws, -56);
    const to = addDays(ws, -1);
    const st: Record<string, { t: number; fds: number; piq: number; weeks: Set<string> }> = {};
    const mem = this.membros(g);
    for (const p of mem) st[p.id] = { t: 0, fds: 0, piq: 0, weeks: new Set() };
    for (const d of dRange(from, to))
      for (const p of mem) {
        const s = this.turnoDe(p.id, d);
        if (!s) continue;
        st[p.id].t++;
        if (this.slotMap.get(s)?.piquete) st[p.id].piq++;
        if (isWE(d)) st[p.id].weeks.add(mondayOf(d));
      }
    for (const x of Object.values(st)) x.fds = x.weeks.size;
    return st;
  }

  estatPessoa(u: string, from: string, to: string): EstatPessoa {
    const st: EstatPessoa = { t: 0, h: 0, M: 0, T: 0, N: 0, piq: 0, fds: 0, exc: 0, maxRun: 0, abs: 0 };
    let run = 0;
    const wk = new Set<string>();
    for (const d of dRange(from, to)) {
      const s = this.turnoDe(u, d);
      const sl = s ? this.slotMap.get(s) : undefined;
      if (sl) {
        st.t++;
        st.h += sl.horas;
        st[sl.periodo]++;
        if (sl.piquete) st.piq++;
        if (isWE(d)) wk.add(mondayOf(d));
        if (this.entradaDe(u, d)?.excecao) st.exc++;
        run++;
        st.maxRun = Math.max(st.maxRun, run);
      } else run = 0;
      if (this.ausenciaEm(u, d, "APROVADA")) st.abs++;
    }
    st.fds = wk.size;
    st.h = Math.round(st.h * 10) / 10;
    return st;
  }

  proximosTurnos(u: string, from: string, n: number) {
    const out: { d: string; s: string }[] = [];
    for (let i = 0, d = from; i < 120 && out.length < n; i++, d = addDays(d, 1)) {
      const s = this.turnoDe(u, d);
      if (s && this.slotMap.get(s)) out.push({ d, s });
    }
    return out;
  }

  /**
   * Pessoas do grupo sem nenhum turno na semana, quando o grupo já tem a semana planeada.
   * Não conta quem tem ausência aprovada em todos os dias em que poderia trabalhar.
   */
  semTurnosNaSemana(g: string, days: string[]): Pessoa[] {
    const mem = this.membros(g);
    if (!days.some((d) => mem.some((p) => this.turnoDe(p.id, d)))) return [];
    return mem.filter((p) => {
      if (days.some((d) => this.turnoDe(p.id, d))) return false;
      const possiveis = days.filter((d) => (p.soFds ? isWE(d) : p.fazFds ? true : !isWE(d)));
      return !possiveis.every((d) => this.ausenciaEm(p.id, d, "APROVADA"));
    });
  }

  alertasSemana(g: string, days: string[]): Alerta[] {
    const out: Alerta[] = [];
    for (const d of days)
      for (const s of this.slots) {
        const [mn] = this.demanda(g, d, s.id);
        const n = this.atribuidos(d, s.id, g).length;
        if (n < mn) out.push({ k: "bad", texto: `${fmtFull(d)} · ${s.etiqueta} — faltam ${mn - n} pessoa(s).` });
      }
    for (const d of days) {
      const x = this.verificarPeriodo(g, d);
      if (x && !x.na && !x.ok)
        out.push({
          k: "bad",
          texto: `${fmtFull(d)} — mínimo por período não cumprido: ${(Object.entries(x.m) as [Periodo, number][])
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${this.periodos[k]} ${x.c[k]}/${v}`)
            .join(", ")}.`,
        });
    }
    for (const v of this.violacoesAlternancia(days[0], days[days.length - 1])) {
      if (this.pessoaMap.get(v.a)?.grupoId !== g) continue;
      out.push({
        k: "warn",
        texto: `${fmtFull(v.d)} — ${this.pessoaMap.get(v.a)!.nome} e ${this.pessoaMap.get(v.b)!.nome} (alternância) estão ambas sem turno.`,
      });
    }
    const fora = this.semTurnosNaSemana(g, days);
    if (fora.length)
      out.push({
        k: "warn",
        texto: `${fora.length === 1 ? "1 pessoa fica" : `${fora.length} pessoas ficam`} sem turnos esta semana: ${fora.map((p) => p.nome).join(", ")}. Confirme se é intencional.`,
      });
    for (const p of this.membros(g)) {
      const e = days.filter((d) => this.entradaDe(p.id, d)?.excecao);
      if (e.length) out.push({ k: "warn", texto: `${p.nome} — ${e.length} turno(s) com exceção autorizada (${e.map(fmt).join(", ")}).` });
      const pend = days.filter((d) => this.turnoDe(p.id, d) && this.ausenciaEm(p.id, d, "PENDENTE"));
      if (pend.length) out.push({ k: "warn", texto: `${p.nome} tem turno em dia(s) com pedido pendente: ${pend.map(fmt).join(", ")}.` });
    }
    return out;
  }

  // ---------------------------------------------------------------- sugestão
  private motivoLacuna(g: string, d: string, sid: string) {
    const per = this.slotMap.get(sid)!.periodo;
    const ok = this.membros(g).filter((p) => p.periodos.includes(per));
    if (!ok.length) return `ninguém em ${this.nomeGrupo(g)} tem ${this.periodos[per]} na preferência`;
    const aus = ok.filter((p) => this.ausenciaEm(p.id, d, "APROVADA")).length;
    const esc = ok.filter((p) => !this.ausenciaEm(p.id, d, "APROVADA") && this.turnoDe(p.id, d) && this.turnoDe(p.id, d) !== sid).length;
    return `${ok.length} com ${this.periodos[per]} na preferência — ${aus} ausente(s), ${esc} já noutro slot nesse dia`;
  }

  /**
   * 1.ª passagem: cobre o mínimo, slots com menos candidatos primeiro.
   * 2.ª passagem (opcional): completa até ao máximo, só sem exceções.
   * Critérios: equilíbrio de turnos, fds e piquetes nas últimas 8 semanas, estabilidade
   * de horário, alternâncias e quem trabalha todos os fds.
   */
  sugerir(ws: string, g: string, opts: { preencherMax?: boolean } = {}) {
    const days = dRange(ws, addDays(ws, 6));
    const mem = this.membros(g);
    const props: Proposta[] = [];
    const gaps: Lacuna[] = [];
    const stats = this.estatSemana(g, ws);
    const prev = this.sim;
    this.sim = { ...(prev ?? {}) };
    const pass = (target: "min" | "max") => {
      const cells: { d: string; s: string; need: number; cands: number }[] = [];
      for (const d of days)
        for (const s of this.slots) {
          const [mn, mx] = this.demanda(g, d, s.id);
          const want = target === "max" ? mx : mn;
          const have = mem.filter((p) => this.turnoDe(p.id, d) === s.id).length;
          if (want - have > 0) cells.push({ d, s: s.id, need: want - have, cands: 0 });
        }
      for (const c of cells) c.cands = mem.filter((p) => this.hardOf(p.id, c.d, c.s).length === 0).length;
      cells.sort((a, b) => a.cands - b.cands || a.d.localeCompare(b.d) || this.slotMap.get(a.s)!.inicioMin - this.slotMap.get(b.s)!.inicioMin);
      for (const c of cells) {
        const sl = this.slotMap.get(c.s)!;
        for (let k = 0; k < c.need; k++) {
          const ranked = mem
            .map((p) => {
              const r = this.verificar(p.id, c.d, c.s);
              if (r.hard.length) return null;
              if (target === "max" && r.soft.length) return null;
              const x = stats[p.id];
              let sc = x.t * 10;
              if (sl.piquete) sc += x.piq * 22;
              if (isWE(c.d)) sc += p.todosFds ? -80 : x.weeks.has(mondayOf(c.d)) ? -6 : x.fds * 45;
              if (this.turnoDe(p.id, addDays(c.d, -1)) === c.s) sc -= 6;
              if (p.alternaCom && this.pessoaMap.get(p.alternaCom) && !this.turnoDe(p.alternaCom, c.d)) sc -= 15;
              sc += r.soft.length * 1000;
              return { p, sc, soft: r.soft };
            })
            .filter((x): x is { p: Pessoa; sc: number; soft: Aviso[] } => !!x)
            .sort((a, b) => a.sc - b.sc || a.p.nome.localeCompare(b.p.nome, "pt"));
          const best = ranked[0];
          if (!best) {
            if (target === "min") gaps.push({ data: c.d, slotId: c.s, grupoId: g, falta: c.need - k, motivo: this.motivoLacuna(g, c.d, c.s) });
            break;
          }
          const x = stats[best.p.id];
          const razao = best.soft.length
            ? "única opção elegível — gera exceção"
            : `${x.t} turnos nas últimas 8 semanas · ${x.fds} fds · ${x.piq} piquetes` +
              (best.p.todosFds && isWE(c.d) ? " · trabalha todos os fds" : "") +
              (this.turnoDe(best.p.id, addDays(c.d, -1)) === c.s ? " · mantém o horário da véspera" : "");
          this.simular(best.p.id, c.d, c.s);
          x.t++;
          if (sl.piquete) x.piq++;
          if (isWE(c.d) && !x.weeks.has(mondayOf(c.d))) {
            x.weeks.add(mondayOf(c.d));
            x.fds++;
          }
          props.push({ data: c.d, slotId: c.s, pessoaId: best.p.id, grupoId: g, soft: best.soft, razao });
        }
      }
    };
    try {
      pass("min");
      if (opts.preencherMax) pass("max");
    } finally {
      this.sim = prev;
    }
    props.sort((a, b) => a.data.localeCompare(b.data) || this.slotMap.get(a.slotId)!.inicioMin - this.slotMap.get(b.slotId)!.inicioMin);
    return { props, gaps };
  }

  /** Sugestão para todos os grupos, em sequência (cada grupo vê as propostas dos anteriores). */
  sugerirTodos(ws: string, opts: { preencherMax?: boolean } = {}) {
    const prev = this.sim;
    this.sim = { ...(prev ?? {}) };
    let props: Proposta[] = [];
    let gaps: Lacuna[] = [];
    try {
      for (const g of this.grupos) {
        const r = this.sugerir(ws, g.id, opts);
        for (const p of r.props) this.simular(p.pessoaId, p.data, p.slotId);
        props = props.concat(r.props);
        gaps = gaps.concat(r.gaps);
      }
    } finally {
      this.sim = prev;
    }
    props.sort((a, b) => a.data.localeCompare(b.data) || this.slotMap.get(a.slotId)!.inicioMin - this.slotMap.get(b.slotId)!.inicioMin);
    return { props, gaps };
  }

  // ---------------------------------------------------------------- validação de escritas
  /**
   * Valida um lote no servidor: remoções primeiro, depois atribuições pela ordem dada.
   * Regras rígidas bloqueiam; regras flexíveis exigem justificação e ficam registadas.
   */
  validarLote(retirar: ItemRetirar[], atribuir: ItemAtribuir[]): ResultadoLote {
    const prev = this.sim;
    this.sim = { ...(prev ?? {}) };
    const res: ResultadoLote = { ok: true, erros: [], atribuir: [], retirar: [] };
    try {
      for (const r of retirar) {
        this.simular(r.pessoaId, r.data, null);
        res.retirar.push(r);
      }
      for (const a of atribuir) {
        const atual = this.turnoDe(a.pessoaId, a.data);
        if (atual === a.slotId) continue;
        if (atual) this.simular(a.pessoaId, a.data, null);
        const v = this.verificar(a.pessoaId, a.data, a.slotId);
        if (v.hard.length) {
          res.erros.push({ data: a.data, pessoaId: a.pessoaId, slotId: a.slotId, motivo: v.hard.join("; ") });
          continue;
        }
        const just = (a.justificacao ?? "").trim();
        if (v.soft.length && !just) {
          res.erros.push({
            data: a.data,
            pessoaId: a.pessoaId,
            slotId: a.slotId,
            motivo: "Viola regras flexíveis e não tem justificação",
            soft: v.soft,
          });
          continue;
        }
        this.simular(a.pessoaId, a.data, a.slotId);
        res.atribuir.push({ ...a, justificacao: v.soft.length ? just : "", excecaoRegras: [...new Set(v.soft.map((w) => w.code))] });
      }
    } finally {
      this.sim = prev;
    }
    res.ok = res.erros.length === 0;
    return res;
  }
}

export const DIA_SEMANA = (d: string) => ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][dow(d)];
