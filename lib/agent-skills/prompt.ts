export interface AgentSkillPackageRow {
  id: string;
  name: string;
  description: string;
  skill_md: string;
  extra_files?: Array<{ path: string; content: string }>;
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

## Agent Skills (formato Claude)
Tens as seguintes skills instaladas. Quando a tarefa do utilizador corresponder à descrição de uma skill, segue as instruções dessa skill em detalhe.

### Catálogo
${catalog}

### Instruções completas
${blocks.join("\n\n---\n\n")}`;
}
