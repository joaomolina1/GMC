import { describe, expect, it } from "vitest";
import { EPISODES, SERIES } from "@lib/tvibox/catalog";
import { ALL_SCREENPLAYS, MAX_EPISODE_SECONDS, SCREENPLAYS, getScreenplay, screenplayDuration } from "@lib/tvibox/screenplays";
import { VEO_PROMPT_TOKEN_LIMIT, detectCharacters, nameTokens, planEpisode, promptName } from "@lib/tvibox/veo-prompts";

const slugs = Object.keys(SCREENPLAYS) as (keyof typeof SCREENPLAYS)[];
const label = (sp: { series: string; episode: number }) => `${sp.series} EP${sp.episode}`;
const OFFSCREEN = /voz|fora de campo|dono|empregada/;

// Marcadores típicos de português do Brasil que não devem aparecer nas falas.
const BRAZILIAN = [/\bvocê\b/i, /\bvocês\b/i, /\bcelular\b/i, /\bônibus\b/i, /\bbanheiro\b/i, /\bcafé da manhã\b/i, /\bt[áa] bom\b/i, /\best(ou|ás|á|amos|ão) \w+[aei]ndo\b/i, /\bpra\b/i];

describe("catálogo", () => {
  it("todas as séries têm EP1 grátis publicado e EP2 pago", () => {
    for (const s of SERIES) {
      const ep1 = EPISODES.find((e) => e.series === s.slug && e.number === 1);
      const ep2 = EPISODES.find((e) => e.series === s.slug && e.number === 2);
      expect(ep1, s.slug).toMatchObject({ isFree: true, coinCost: 0, status: "published" });
      expect(ep2, s.slug).toMatchObject({ isFree: false, coinCost: 15 });
    }
  });
});

describe("argumentos", () => {
  it("cada série tem argumento do EP1; todos os argumentos têm ≤ 90 s e cliffhanger", () => {
    expect(slugs).toHaveLength(SERIES.length);
    for (const slug of slugs) expect(SCREENPLAYS[slug].episode).toBe(1);
    for (const sp of ALL_SCREENPLAYS) {
      expect(screenplayDuration(sp), label(sp)).toBeLessThanOrEqual(MAX_EPISODE_SECONDS);
      expect(sp.beats[0].dur, label(sp)).toBe(8);
      expect(sp.beats.slice(1).every((b) => b.dur === 7), label(sp)).toBe(true);
      expect(sp.beats[sp.beats.length - 1].shot.toLowerCase(), label(sp)).toContain("hard cut");
    }
  });

  it("getScreenplay devolve o episódio pedido e nada para episódios não escritos", () => {
    expect(getScreenplay("sangue")).toBe(SCREENPLAYS.sangue);
    expect(getScreenplay("sangue", 2)?.title).toBe("O terceiro envelope");
    expect(getScreenplay("patroa", 2)?.title).toBe("Sete da manhã");
    expect(getScreenplay("traicao", 2)).toBeUndefined();
    const keys = ALL_SCREENPLAYS.map((sp) => `${sp.series}-${sp.episode}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("os diálogos estão em português europeu", () => {
    for (const sp of ALL_SCREENPLAYS) {
      for (const beat of sp.beats) {
        for (const line of beat.lines) {
          for (const re of BRAZILIAN) expect(line.text, `${label(sp)}: ${line.text}`).not.toMatch(re);
        }
      }
    }
  });

  it("cada fala pertence a uma personagem do elenco ou a uma voz fora de campo", () => {
    for (const sp of ALL_SCREENPLAYS) {
      const tokens = sp.cast.flatMap((c) => nameTokens(c.name));
      for (const beat of sp.beats) {
        for (const line of beat.lines) {
          const who = line.who.toLowerCase();
          const known = tokens.some((n) => who.includes(n)) || OFFSCREEN.test(who);
          expect(known, `${label(sp)}: ${line.who}`).toBe(true);
        }
      }
    }
  });

  it("um episódio seguinte continua o anterior: mesma série, elenco recorrente com o mesmo nome e visual coerente", () => {
    const sequels = ALL_SCREENPLAYS.filter((sp) => sp.episode > 1);
    expect(sequels.length).toBeGreaterThan(0);
    for (const sp of sequels) {
      const prev = getScreenplay(sp.series, sp.episode - 1);
      expect(prev, label(sp)).toBeDefined();
      // O protagonista do EP1 volta no EP2 (nome exato) e a bíblia visual mantém a mesma estética.
      const recurring = sp.cast.filter((c) => prev!.cast.some((p) => p.name === c.name));
      expect(recurring.length, label(sp)).toBeGreaterThanOrEqual(2);
      expect(sp.visualBible.toLowerCase(), label(sp)).toContain("vertical 9:16");
      // Há sempre uma entrada no catálogo para este episódio e para o seguinte (o paywall mostra o gancho do próximo).
      const row = EPISODES.find((e) => e.series === sp.series && e.number === sp.episode);
      const next = EPISODES.find((e) => e.series === sp.series && e.number === sp.episode + 1);
      expect(row?.title, label(sp)).toBe(sp.title);
      expect(row, label(sp)).toMatchObject({ isFree: false, coinCost: 15 });
      expect(next?.hookText, label(sp)).toBeTruthy();
    }
  });
});

describe("planEpisode (Veo)", () => {
  it("gera um passo por beat com prompts dentro do limite de tokens", () => {
    for (const sp of ALL_SCREENPLAYS) {
      const plan = planEpisode(sp, "extend");
      expect(plan).toHaveLength(sp.beats.length);
      expect(plan[0].kind).toBe("open");
      expect(plan.slice(1).every((p) => p.kind === "extend" && p.durationSeconds === 7)).toBe(true);
      for (const p of plan) expect(p.approxTokens, `${label(sp)} passo ${p.index}`).toBeLessThan(VEO_PROMPT_TOKEN_LIMIT);
    }
  });

  it("os prompts com falas exigem português europeu e proíbem legendas", () => {
    const plan = planEpisode(SCREENPLAYS.sangue, "extend");
    const spoken = plan.find((p) => p.prompt.includes("Dialogue:"))!;
    expect(spoken.prompt).toContain("European Portuguese");
    expect(spoken.prompt).toContain("never Brazilian");
    expect(spoken.prompt).toContain("No subtitles");
    const silent = planEpisode(SCREENPLAYS.patroa, "extend")[0];
    expect(silent.prompt).toContain("No dialogue");
  });

  it("modo shots produz clips de 8 s autónomos", () => {
    const plan = planEpisode(SCREENPLAYS.fogo, "shots");
    expect(plan.every((p) => p.kind === "shot" && p.durationSeconds === 8)).toBe(true);
    expect(plan[3].prompt).toContain(SCREENPLAYS.fogo.visualBible.slice(0, 30));
  });

  it("detectCharacters encontra o elenco pelas falas e pelo plano", () => {
    const sp = SCREENPLAYS.sangue;
    const last = sp.beats[sp.beats.length - 1];
    const names = detectCharacters(last, sp.cast).map((c) => c.name);
    expect(names).toContain("Dr. Nuno Alves");
    expect(names).toContain("Beatriz Sequeira");
    // títulos honoríficos não contam como nome
    const fogo = SCREENPLAYS.fogo;
    expect(detectCharacters(fogo.beats[0], fogo.cast).map((c) => c.name)).toEqual([
      "Inspetora Sofia Rocha",
      "Inspetor Rui Baptista",
    ]);
  });

  it("os prompts nunca levam nomes completos do elenco nem 'same actors/faces' (filtros do Veo)", () => {
    expect(promptName("Rodrigo Sequeira")).toBe("Rodrigo");
    expect(promptName("Dr. Nuno Alves")).toBe("Dr. Nuno");
    expect(promptName("Inspetora Sofia Rocha")).toBe("Inspetora Sofia");
    expect(promptName("Coronel Castelo")).toBe("Coronel Castelo");
    expect(promptName("Carla")).toBe("Carla");
    expect(promptName("Dona Graça")).toBe("Dona Graça");
    for (const sp of ALL_SCREENPLAYS) {
      for (const mode of ["extend", "shots"] as const) {
        for (const p of planEpisode(sp, mode)) {
          for (const c of sp.cast) {
            if (promptName(c.name) !== c.name) expect(p.prompt, `${label(sp)} passo ${p.index}`).not.toContain(c.name);
          }
          expect(p.prompt).not.toMatch(/same actors|same faces/);
        }
      }
    }
  });

  it("todos os beats com falas incluem a descrição de pelo menos uma personagem", () => {
    for (const sp of ALL_SCREENPLAYS) {
      const plan = planEpisode(sp, "extend");
      sp.beats.forEach((b, i) => {
        if (b.lines.some((l) => !OFFSCREEN.test(l.who.toLowerCase()))) {
          expect(plan[i].prompt, `${label(sp)} beat ${i}`).toContain("Characters:");
        }
      });
    }
  });
});
