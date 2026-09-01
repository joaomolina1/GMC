export interface SkillExtraFile {
  path: string;
  content: string;
  anthropic_file_id?: string;
  content_hash?: string;
}

export interface AgentSkillPackageRow {
  id: string;
  name: string;
  description: string;
  skill_md: string;
  extra_files?: SkillExtraFile[];
  anthropic_skill_id?: string | null;
}

export function buildSkillCatalog(packages: AgentSkillPackageRow[]): string {
  return packages.map((p) => `- **${p.name}**: ${p.description}`).join("\n");
}

function skillInstructionBlock(pkg: AgentSkillPackageRow): string {
  const extras = (pkg.extra_files ?? [])
    .map((f) => `#### Ficheiro: ${f.path}\n${f.content}`)
    .join("\n\n");

  return `### Skill: ${pkg.name}
${pkg.skill_md}${extras ? `\n\n${extras}` : ""}`;
}

/**
 * System prompt for attached Agent Skills.
 * Native Anthropic custom skills only need a catalog (progressive disclosure).
 * Packages without anthropic_skill_id keep the full SKILL.md fallback.
 */
export function buildAgentSkillsPrompt(packages: AgentSkillPackageRow[]): string {
  if (packages.length === 0) return "";

  const catalog = buildSkillCatalog(packages);
  const native = packages.filter((p) => Boolean(p.anthropic_skill_id?.trim()));
  const fallback = packages.filter((p) => !p.anthropic_skill_id?.trim());

  const nativeHint =
    native.length > 0
      ? `
As skills com ID Anthropic estão carregadas no container (API Skills). Quando a tarefa corresponder ao catálogo, **usa a skill via code execution** — não improvises um workflow alternativo.
`
      : "";

  const fallbackBlocks =
    fallback.length > 0
      ? `

### Instruções completas (skills sem API nativa)
${fallback.map(skillInstructionBlock).join("\n\n---\n\n")}`
      : "";

  return `

## Agent Skills instaladas (OBRIGATÓRIO seguir)
Tens skills personalizadas neste agente. **Antes de responder**, verifica se a tarefa corresponde ao catálogo.
${nativeHint}Usa code execution quando a skill o indicar.
Quando a skill gerar um ficheiro (HTML, PPTX, etc.), **cria-o directamente em** \`/mnt/user-data/outputs/\` **com bash** (ex: \`cat > /mnt/user-data/outputs/slide_1.html << 'EOF'\`). Copiar ficheiros para outputs **não** activa download — só ficheiros criados lá têm \`file_id\`.
Nunca inventes listas de ficheiros em markdown; o download só existe quando a plataforma mostra botões verdes.

### Catálogo
${catalog}${fallbackBlocks}`;
}
