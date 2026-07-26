# GMC Platform MCP Server

Servidor [MCP](https://modelcontextprotocol.io) que permite a um LLM **criar, modificar, orquestrar e executar** agentes e flows da plataforma GMC.

## Tools

| Tool | O que faz |
|------|-----------|
| `get_platform_capabilities` | Descobre scopes, tools de agente, tipos de nós de flow |
| `list_agents` / `get_agent` | Listar / detalhe (com versões) |
| `create_agent` | Criar agente + versão draft |
| `update_agent` | Metadados (nome, visibilidade, status) |
| `update_agent_config` | Prompt, skills/tools, esforço; publica para ficar runnable |
| `delete_agent` | Apagar |
| `run_agent` | Executar agente publicado |
| `list_flows` / `get_flow` | Listar / graph |
| `create_flow` | Criar flow (trigger → output) |
| `update_flow` | Metadados + graph completo |
| `orchestrate_agent_flow` | Atalho: trigger → agent → output |
| `delete_flow` | Apagar |
| `run_flow` / `get_flow_run` | Executar flow / ver run |
| `list_knowledge_documents` | Docs RAG de um agente |

## Setup rápido

### 1. Criar API key na plataforma

Backoffice → **API Keys** → criar chave com scopes de orquestração:

```
agents:read, agents:write, agents:run,
flows:read, flows:write, flows:run,
knowledge:read, marketplace:read
```

Guarde o secret `gmc_live_...` (só aparece uma vez).

### 2. Instalar o servidor MCP

```bash
cd mcp
npm install
```

### 3. Ligar no Cursor / Claude Desktop

**Cursor** — `~/.cursor/mcp.json` (ou project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "gmc": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/GMC/mcp/src/index.ts"],
      "env": {
        "GMC_API_URL": "https://gmcprototypes.vercel.app",
        "GMC_API_KEY": "gmc_live_..."
      }
    }
  }
}
```

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gmc": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/GMC/mcp/src/index.ts"],
      "env": {
        "GMC_API_URL": "https://gmcprototypes.vercel.app",
        "GMC_API_KEY": "gmc_live_..."
      }
    }
  }
}
```

Para desenvolvimento local: `GMC_API_URL=http://localhost:3000`.

### 4. Exemplo de orquestração (o LLM faz isto via tools)

1. `create_agent` — nome + system_prompt + skills `["web_search","create_documents"]`
2. `update_agent_config` — refinar prompt e `publish`
3. `create_flow` — nome do pipeline
4. `orchestrate_agent_flow` — ligar o agente ao flow
5. `run_flow` — `{ input: "Gera um resumo executivo..." }`
6. ou `run_agent` — execução directa sem flow

## Arquitectura

```
LLM (Cursor/Claude)
    │  MCP stdio
    ▼
mcp/src/index.ts  (este servidor)
    │  HTTPS + Bearer gmc_live_…
    ▼
GMC /api/v1/*  (Next.js + Supabase service role)
    │
    ▼
agents / flows / runs
```

O MCP **não** usa cookies de sessão — só platform API keys. Os agentes da plataforma continuam a poder ligar MCPs externos próprios (Gmail, etc.) via Anthropic; este servidor é o MCP **da** GMC.

## Scopes

| Scope | Permite |
|-------|---------|
| `agents:read` | list/get |
| `agents:write` | create/update/delete/config |
| `agents:run` | executar |
| `flows:read` | list/get/run status |
| `flows:write` | create/update/delete/graph |
| `flows:run` | executar |
| `knowledge:read` | listar documentos |

`*:write` implica `*:read` no mesmo recurso.
