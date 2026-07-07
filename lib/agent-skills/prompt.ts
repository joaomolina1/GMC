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
}

/**
 * Build system prompt section for Claude-style Agent Skills attached to an agent.
 * Includes catalog (name + description) and full SKILL.md instructions.
 */
export function buildAgentSkillsPrompt(packages: AgentSkillPackageRow[]): string {
  if (packages.length === 0) return "";

  const catalog = packages
    .map((p) => `- **${p.name}**: ${p.description}`)
    .join("\n");

  const blocks = packages.map((pkg) => {
    const extras = (pkg.extra_files ?? [])
      .map((f) => `#### Ficheiro: ${f.path}\n${f.content}`)
      .join("\n\n");

    return `### Skill: ${pkg.name}
${pkg.skill_md}${extras ? `\n\n${extras}` : ""}`;
  });

  return `

## Agent Skills instaladas (OBRIGATÓRIO seguir)
Tens skills personalizadas instaladas neste agente. **Antes de responder**, verifica se a tarefa do utilizador corresponde ao catálogo abaixo.
Se corresponder, **segue as instruções da skill em detalhe** — não improvises um workflow alternativo.
Usa code execution com os ficheiros do container quando a skill o indicar.
Quando a skill gerar um ficheiro (HTML, PPTX, etc.), **cria-o directamente em** \`/mnt/user-data/outputs/\` **com bash** (ex: \`cat > /mnt/user-data/outputs/slide_1.html << 'EOF'\`). Copiar ficheiros para outputs **não** activa download — só ficheiros criados lá têm \`file_id\`.
Nunca inventes listas de ficheiros em markdown; o download só existe quando a plataforma mostra botões verdes.

### Catálogo
${catalog}

### Instruções completas
${blocks.join("\n\n---\n\n")}`;
}
