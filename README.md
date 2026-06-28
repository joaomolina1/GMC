# GMC — Plataforma de Agentes IA

Plataforma interna de agentes de IA para o **Grupo Media Capital**.

## Stack

- **Next.js 15** (App Router) + **React 19** + TypeScript + Tailwind CSS
- **Supabase** — Auth, PostgreSQL, pgvector, Storage, RLS
- **Anthropic Claude** — AI Gateway (default provider)
- **TanStack Query** — client data fetching
- **Vercel** — hosting

## Fase 1 — Fundação + Skills Core

- ✅ Scaffold Next.js 15 + tema Media Capital
- ✅ Supabase schema (public), pgvector, RLS, buckets, `match_chunks`
- ✅ Auth + profiles/RBAC
- ✅ AI Gateway (Anthropic) + `/api/chat` streaming SSE
- ✅ Agents CRUD + versionamento + Agent Builder
- ✅ Skills Engine + 4 skills core (web_search, read_document, vision, knowledge_search)
- ✅ Knowledge upload → embeddings → RAG
- ✅ Dashboard + backoffice mínimo (users/costs/logs)

## Setup

```bash
cp .env.example .env.local
# Preencher: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#            SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY

npm install
npm run dev
```

## Migrations

```bash
# Aplicadas via Supabase MCP ou CLI
supabase db push
npm run db:types
```

## Rotas

| Rota | Descrição |
|------|-----------|
| `/` | Dashboard |
| `/login` | Autenticação |
| `/agents` | Lista de agentes |
| `/agents/new` | Criar agente |
| `/agents/[id]` | Agent Builder |
| `/agents/[id]/chat` | Chat com streaming |
| `/admin` | Backoffice |
| `/marketplace` | Fase 3 (placeholder) |
| `/flows` | Fase 5 (placeholder) |

## Arquitetura

```
app/          → UI (route groups)
lib/ai/       → AI Gateway (providers, embeddings)
lib/skills/   → Skills Engine (registry, runner, core skills)
lib/supabase/ → SSR clients
lib/flows/    → Flow Engine (Fase 5)
```

## Roadmap

- **Fase 2** — RAG avançado, OCR, Vision melhorado
- **Fase 3** — Marketplace
- **Fase 4** — Skills plugins (HTTP, SQL, Run Code)
- **Fase 5** — Flow Builder
- **Fase 6** — Enterprise (Entra ID, quotas, auditoria)
