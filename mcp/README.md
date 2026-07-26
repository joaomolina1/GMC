# GMC Platform MCP Server

Servidor [MCP](https://modelcontextprotocol.io) para **criar, modificar, orquestrar e executar** agentes e flows da plataforma GMC.

Suporta dois modos:

| Modo | Comando | Uso |
|------|---------|-----|
| **Remote HTTP** (Streamable HTTP) | `npm run dev:http` / `npm start` | OpenAI Agent Builder, Responses API, MCP Inspector, clientes remotos |
| **stdio** (local) | `npm run dev:stdio` | Cursor / Claude Desktop local |

As tools são partilhadas — sem duplicação entre transportes.

## Arquitectura

```
Cliente MCP (OpenAI / Cursor / Inspector)
    │  HTTPS + Bearer MCP_AUTH_TOKEN
    │  POST/GET/DELETE /mcp  (Streamable HTTP)
    ▼
mcp/src/server/http.ts
    │  tools (createMcpServer)
    ▼
GmcApiClient  ──Bearer GMC_API_KEY──►  GMC /api/v1/*
```

Segredos distintos:

- `MCP_AUTH_TOKEN` — clientes → MCP
- `GMC_API_KEY` — MCP → API GMC

## Requisitos

- Node.js 18+
- API key GMC com scopes de orquestração
- Token de autenticação MCP (obrigatório em HTTP / produção)

## Instalação

```bash
cd mcp
npm install
cp .env.example .env
# editar .env com valores reais
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `GMC_API_URL` | sim | Base URL da plataforma (ex. `https://gmcprototypes.vercel.app`) |
| `GMC_API_KEY` | sim | Chave `gmc_live_...` da API GMC |
| `MCP_AUTH_TOKEN` | HTTP sim | Bearer token dos clientes MCP |
| `PORT` | não (3000) | Porta HTTP |
| `HOST` | não (`0.0.0.0`) | Bind address |
| `NODE_ENV` | não | `development` / `production` / `test` |

Opcionais: `GMC_REQUEST_TIMEOUT_MS`, `MCP_SESSION_TTL_MS`, `MCP_MAX_SESSIONS`, `MCP_RATE_LIMIT_WINDOW_MS`, `MCP_RATE_LIMIT_MAX`, `MCP_BODY_LIMIT_BYTES`.

**Nunca** reutilize `GMC_API_KEY` como `MCP_AUTH_TOKEN`.

## Execução HTTP

```bash
npm run dev:http
# → http://localhost:3000/mcp
# → http://localhost:3000/health
```

Produção:

```bash
npm run build
npm start
```

Headers:

```http
Authorization: Bearer <MCP_AUTH_TOKEN>
Content-Type: application/json
Accept: application/json, text/event-stream
```

Sessões: stateful (`mcp-session-id`). TTL por omissão 30 min; máximo 200 sessões; rate limit 120 req/min por IP; body máx. 1 MiB.

## Execução stdio

```bash
npm run dev:stdio
```

Cursor `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "gmc": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/GMC/mcp/src/server/stdio.ts"],
      "env": {
        "GMC_API_URL": "https://gmcprototypes.vercel.app",
        "GMC_API_KEY": "gmc_live_..."
      }
    }
  }
}
```

## Migração de stdio para Remote MCP

| | Antes | Agora |
|--|-------|-------|
| Transporte | só stdio | HTTP Streamable + stdio opcional |
| Auth cliente | n/a (processo local) | `Authorization: Bearer MCP_AUTH_TOKEN` |
| Segredo API GMC | no cliente MCP local | só no servidor MCP |
| URL | caminho local `mcp/src/index.ts` | `https://<serviço>/mcp` |

Rollback: continue a usar `npm run dev:stdio` / `src/index.ts` (ainda aponta para stdio).

## Tools

| Tool | Tipo | Efeito externo | Dados sensíveis | Aprovação |
|------|------|----------------|-----------------|-----------|
| `get_platform_capabilities` | read-only | nenhum | baixo | auto |
| `list_agents` / `get_agent` | read-only | nenhum | metadados agentes | auto |
| `list_flows` / `get_flow` / `get_flow_run` | read-only | nenhum | metadados flows | auto |
| `list_knowledge_documents` | read-only | nenhum | nomes docs | auto |
| `create_agent` / `update_agent` / `update_agent_config` | write | cria/altera agentes | prompts | pedir confirmação |
| `create_flow` / `update_flow` / `orchestrate_agent_flow` | write | cria/altera flows | graphs | pedir confirmação |
| `run_agent` / `run_flow` | write | executa LLM (custo) | inputs/outputs | pedir confirmação |
| `delete_agent` / `delete_flow` | destructive | apaga permanentemente | — | sempre confirmar |

## Testes

```bash
npm run typecheck
npm test
npm run test:integration
```

## MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

- Transport: **Streamable HTTP**
- URL: `http://localhost:3000/mcp`
- Header: `Authorization: Bearer <MCP_AUTH_TOKEN>`

## curl

### Health

```bash
curl -i http://localhost:3000/health
```

### Sem autenticação (espera 401)

```bash
curl -i -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"manual-test","version":"1.0.0"}}}'
```

### Com autenticação

```bash
curl -i -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"manual-test","version":"1.0.0"}}}'
```

Guarde o header `mcp-session-id` da resposta para pedidos seguintes.

## Docker

```bash
docker build -t gmc-mcp .
docker run --rm -p 3000:3000 \
  -e GMC_API_URL=https://gmcprototypes.vercel.app \
  -e GMC_API_KEY=replace_me \
  -e MCP_AUTH_TOKEN=replace_me \
  gmc-mcp
```

## Deployment (Render)

Blueprint em `mcp/render.yaml`:

```text
Build: npm ci && npm run build
Start: npm start
Health: /health
```

Env secrets: `GMC_API_URL`, `GMC_API_KEY`, `MCP_AUTH_TOKEN`.

Endpoint: `https://<serviço>.onrender.com/mcp`

Bind: `0.0.0.0:$PORT` (Render).

## OpenAI (Remote MCP)

```json
{
  "type": "mcp",
  "server_label": "gmc",
  "server_description": "Ferramentas para consultar e gerir recursos GMC.",
  "server_url": "https://<serviço>/mcp",
  "authorization": "<MCP_AUTH_TOKEN>"
}
```

## Troubleshooting

| Sintoma | Causa provável |
|---------|----------------|
| 401 em `/mcp` | `MCP_AUTH_TOKEN` em falta/errado |
| 400 sem session | falta `mcp-session-id` após `initialize` |
| 404 session | sessão expirada / servidor reiniciado |
| tool `GMC_UNAUTHORIZED` | `GMC_API_KEY` inválida/revogada |
| cold start lento | plano free Render — faça warm-up em `/health` |
