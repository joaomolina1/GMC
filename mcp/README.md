# GMC Platform MCP Server

Servidor [MCP](https://modelcontextprotocol.io) para **criar, modificar, orquestrar e executar** agentes e flows da plataforma GMC.

## Produção (Vercel)

O endpoint Remote MCP corre **no mesmo projecto Next.js** em Vercel:

```text
https://gmcprototypes.vercel.app/mcp
```

Implementação: `app/mcp/route.ts` (Streamable HTTP, modo **stateless**, adequado a serverless).

### Variáveis no projecto Vercel

| Variável | Descrição |
|----------|-----------|
| `GMC_API_KEY` | Chave `gmc_live_...` (Backoffice → API) usada pelo servidor para `/api/v1` |
| `GMC_API_URL` | Opcional; por omissão usa o próprio origin / `VERCEL_URL` |
| `MCP_AUTH_TOKEN` | Opcional / legado — fallback se não usar chaves MCP da BD |

### Chaves MCP (Backoffice → API)

Crie e revogue chaves `mcp_...` no separador **API** (secção **Chaves MCP**). Clientes usam:

```http
Authorization: Bearer mcp_...
```

### Cliente remoto (OpenAI / Inspector)

```json
{
  "type": "mcp",
  "server_label": "gmc",
  "server_description": "Ferramentas para consultar e gerir recursos GMC.",
  "server_url": "https://gmcprototypes.vercel.app/mcp",
  "authorization": "mcp_..."
}
```

Headers:

```http
Authorization: Bearer mcp_...
Content-Type: application/json
Accept: application/json, text/event-stream
```

## Modos locais (pasta `mcp/`)

| Modo | Comando | Uso |
|------|---------|-----|
| HTTP local | `npm run dev:http` | `http://localhost:3000/mcp` (Express, sessões) |
| stdio | `npm run dev:stdio` | Cursor / Claude Desktop |

As tools são partilhadas (`mcp/src/tools`).

## Arquitectura

```
Cliente MCP ──Bearer MCP_AUTH_TOKEN──►  Vercel /mcp  (Next.js route)
                                            │
                                    createMcpServer + tools
                                            │
                                 GmcApiClient ──GMC_API_KEY──► /api/v1
```

`MCP_AUTH_TOKEN` ≠ `GMC_API_KEY`. Nunca reutilizar.

## Instalação local do package `mcp/`

```bash
cd mcp
npm install
cp .env.example .env
npm run dev:http    # ou npm run dev:stdio
npm test && npm run typecheck
```

## Tools (classificação)

| Tool | Tipo | Aprovação |
|------|------|-----------|
| `get_platform_capabilities`, `list_*`, `get_*` | read-only | auto |
| `create_*`, `update_*`, `orchestrate_*`, `run_*` | write | confirmar |
| `delete_agent`, `delete_flow` | destructive | sempre confirmar |

## Migração stdio → Remote MCP

| | Antes | Agora |
|--|-------|-------|
| Host | processo local | Vercel `https://gmcprototypes.vercel.app/mcp` |
| Auth cliente | n/a | `MCP_AUTH_TOKEN` |
| `GMC_API_KEY` | no Cursor | só no servidor Vercel |

stdio continua disponível via `mcp/src/server/stdio.ts`.

## Docker (opcional / self-host)

Ver `mcp/Dockerfile` se quiseres correr o Express HTTP fora da Vercel. Em produção GMC usa-se o endpoint Next.js em Vercel.

## Troubleshooting

| Sintoma | Causa |
|---------|-------|
| 401 | `MCP_AUTH_TOKEN` em falta/errado |
| 503 | `GMC_API_KEY` ou `MCP_AUTH_TOKEN` não definidos na Vercel |
| timeout em `run_*` | execução longa; `maxDuration` do `/mcp` é 300s |
| Not Acceptable | falta `Accept: application/json, text/event-stream` |
