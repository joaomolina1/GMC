"use client";

import { formatNumberPt } from "@lib/pt26/format";
import { ANSWER_KEYS, type LiveItem, type LivePayload, type LiveQuadro, type LiveQuestion, type LiveWeek } from "@lib/pt26/types";
import { Avatar, Bar, Count, Delta, StackSegment } from "./primitives";

const YES = "var(--yes)";
const NO = "var(--no)";
const GREY = "var(--grey)";

export interface ViewProps {
  payload: LivePayload;
  question: LiveQuestion;
  quadro: LiveQuadro;
  /** Quadros da pergunta nesta semana (para o offset da posição na P1). */
  quadros: LiveQuadro[];
  week: LiveWeek;
}

const find = (quadro: LiveQuadro, key: string): LiveItem | undefined => quadro.items.find((i) => i.key === key);
const val = (quadro: LiveQuadro, key: string): number => find(quadro, key)?.value ?? 0;
const delta = (quadro: LiveQuadro, key: string): number | null => find(quadro, key)?.delta ?? null;

function StatRow({ label, value, color, delta }: { label: string; value: number; color: string; delta: number | null }) {
  return (
    <div className="row stat" style={{ "--c": color } as React.CSSProperties}>
      <div className="who">
        <div className="n">{label}</div>
        <Bar pct={value} />
      </div>
      <div>
        <div className="val">
          <Count value={value} decimals={0} />
        </div>
        <Delta delta={delta} decimals={0} />
      </div>
    </div>
  );
}

export function PartyView({ payload, quadro, quadros }: ViewProps) {
  const max = Math.max(...quadro.items.map((i) => i.value), 1) * 1.12;
  const offset = quadros.filter((q) => q.idx < quadro.idx).reduce((s, q) => s + q.items.length, 0);
  return (
    <div className="rows">
      {quadro.items.map((it, i) => {
        const party = it.partyId ? payload.parties[it.partyId] : null;
        const leader = party?.leaderId ? payload.people[party.leaderId] : null;
        const color = party?.color ?? "#8f98b4";
        return (
          <div key={it.key} className="row" style={{ "--c": color } as React.CSSProperties}>
            <div className="rank">{offset + i + 1}º</div>
            <Avatar name={leader?.name ?? null} color={color} size={72} photo={leader?.photo?.small} logo={party?.logoUrl} fallback={(party?.acronym ?? it.key).replace(/\//g, "")} />
            <div className="who">
              <div className="n">{party?.acronym ?? it.key}</div>
              <div className="r">{leader?.name ?? (party && !party.leaderId ? party.name : "")}</div>
              <Bar pct={(it.value / max) * 100} />
            </div>
            <div>
              <div className="val">
                <Count value={it.value} decimals={1} />
              </div>
              <Delta delta={it.delta} decimals={1} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ApprovalView({ payload, quadro }: ViewProps) {
  const a = val(quadro, ANSWER_KEYS.APROVA);
  const d = val(quadro, ANSWER_KEYS.DESAPROVA);
  const n = val(quadro, ANSWER_KEYS.NSNR);
  const saldo = quadro.saldo?.value ?? a - d;
  const person = quadro.personId ? payload.people[quadro.personId] : null;
  return (
    <div className="split">
      <div className="left">
        {person && (
          <div className="person">
            <Avatar name={person.name} color="rgba(255,255,255,.35)" size={96} photo={person.photo?.small} />
            <div>
              <div className="n">{person.name}</div>
              <div className="r">{person.role}</div>
            </div>
          </div>
        )}
        <StatRow label="Aprova" value={a} color={YES} delta={delta(quadro, ANSWER_KEYS.APROVA)} />
        <StatRow label="Desaprova" value={d} color={NO} delta={delta(quadro, ANSWER_KEYS.DESAPROVA)} />
        <StatRow label="Não sabe / não responde" value={n} color={GREY} delta={delta(quadro, ANSWER_KEYS.NSNR)} />
      </div>
      <div className="saldo" style={{ color: saldo < 0 ? NO : YES }}>
        <div className="big">
          <Count value={saldo} decimals={0} unit="" />
        </div>
        <div className="lbl">Saldo: aprova menos desaprova</div>
        <Delta delta={quadro.saldo?.delta ?? null} decimals={0} />
      </div>
    </div>
  );
}

export function YesNoView({ quadro, week }: ViewProps) {
  const s = val(quadro, ANSWER_KEYS.SIM);
  const n = val(quadro, ANSWER_KEYS.NAO);
  const x = val(quadro, ANSWER_KEYS.NSNR);
  return (
    <div className="yn">
      <div className="heads">
        <div className="h">
          <div className="k">Sim</div>
          <div className="v" style={{ color: YES }}>
            <Count value={s} decimals={0} />
          </div>
          <Delta delta={delta(quadro, ANSWER_KEYS.SIM)} decimals={0} className="l" />
        </div>
        <div className="h r">
          <div className="k">Não</div>
          <div className="v" style={{ color: NO }}>
            <Count value={n} decimals={0} />
          </div>
          <Delta delta={delta(quadro, ANSWER_KEYS.NAO)} decimals={0} />
        </div>
      </div>
      <div className="stack">
        <StackSegment pct={s} color={YES} />
        <StackSegment pct={n} color={NO} />
        <StackSegment pct={x} color={GREY} />
      </div>
      <div className="foot">
        <span>
          Não sabe / não responde <b>{formatNumberPt(x, 0)}%</b>
        </span>
        <span>{week.label}</span>
      </div>
    </div>
  );
}

export function MinisterView({ payload, quadro }: ViewProps) {
  const person = quadro.personId ? payload.people[quadro.personId] : null;
  const name = person?.name ?? quadro.title ?? "";
  return (
    <div className="split">
      <div className="mcard">
        <Avatar name={name || null} color="rgba(255,255,255,.35)" size={150} photo={person?.photo?.large ?? person?.photo?.small} />
        <div>
          <div className="n">{name}</div>
          <div className="r">{person?.role ?? ""}</div>
        </div>
      </div>
      <div className="left">
        <StatRow label="Sim" value={val(quadro, ANSWER_KEYS.SIM)} color={YES} delta={delta(quadro, ANSWER_KEYS.SIM)} />
        <StatRow label="Não" value={val(quadro, ANSWER_KEYS.NAO)} color={NO} delta={delta(quadro, ANSWER_KEYS.NAO)} />
        <StatRow label="Não sabe / não responde" value={val(quadro, ANSWER_KEYS.NSNR)} color={GREY} delta={delta(quadro, ANSWER_KEYS.NSNR)} />
      </div>
    </div>
  );
}

export function RankingView({ payload, question, quadro }: ViewProps) {
  const color = question.sign < 0 ? NO : YES;
  const max = Math.max(...quadro.items.map((i) => Math.abs(i.value)), 1) * 1.1;
  return (
    <div className="cards">
      {quadro.items.map((it, i) => {
        const person = it.personId ? payload.people[it.personId] : null;
        return (
          <div key={it.key} className="card" style={{ "--c": color } as React.CSSProperties}>
            <div className="pos">{i + 1}º</div>
            <Avatar name={person?.name ?? it.key} color={color} size={118} photo={person?.photo?.small} />
            <div className="n">{person?.name ?? it.key}</div>
            <div className="r">{person?.role ?? ""}</div>
            <div className="big" style={{ color }}>
              <Count value={it.value} decimals={1} />
            </div>
            <Bar pct={(Math.abs(it.value) / max) * 100} />
            <Delta delta={it.delta} decimals={1} />
          </div>
        );
      })}
    </div>
  );
}

export const VIEWS: Record<LiveQuestion["kind"], (p: ViewProps) => React.JSX.Element> = {
  PARTY: PartyView,
  APPROVAL: ApprovalView,
  YESNO: YesNoView,
  MINISTER: MinisterView,
  RANKING: RankingView,
};
