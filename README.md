# GMC — Plataforma de Agentes IA

Plataforma interna de agentes de IA para o **Grupo Media Capital**.

## Stack

- **Next.js 15** (App Router) + **React 19** + TypeScript + Tailwind CSS
- **Supabase** — Auth, PostgreSQL, pgvector, Storage, RLS
- **Anthropic Claude** — AI Gateway (chat, vision, OCR)
- **Voyage AI** — Embeddings semânticos (1536-dim)
- **TanStack Query** — client data fetching
- **Vercel** — hosting

## Fase 1 — Fundação + Skills Core ✅

- Scaffold Next.js 15 + tema Media Capital
- Supabase schema (public), pgvector, RLS, buckets, `match_chunks`
- Auth + profiles/RBAC
- AI Gateway (Anthropic) + `/api/chat` streaming SSE
- Agents CRUD + versionamento + Agent Builder
- Skills Engine + 4 skills core (web_search, read_document, vision, knowledge_search)
- Knowledge upload → embeddings → RAG
- Dashboard + backoffice mínimo (users/costs/logs)

## Fase 2 — RAG Avançado, OCR, Vision Melhorado ✅

- **Embeddings reais** via Voyage AI (`voyage-3`, 1536-dim) com fallback pseudo-hash para dev
- **Chunking avançado** — paragraph-aware, metadata rica (filename, page, char offsets)
- **OCR via Vision** — extração de texto de imagens e documentos digitalizados (Claude Haiku)
- **Extração de documentos** — PDF, DOCX, XLSX, PPTX, CSV, TXT, MD, imagens
- **Knowledge management** — eliminar documentos, reindexar, badges OCR/chunks
- **Chat multimodal** — imagens anexadas enviadas como content blocks ao modelo
- **Vision melhorado** — suporte multi-imagem, OCR integrado no read_document
- **RAG melhorado** — query embeddings separados (`input_type: query`), threshold de relevância

## Fase 3 — Marketplace ✅

- **Catálogo público** — agentes com `visibility=public` e versão publicada
- **Pesquisa e filtros** — texto, categoria, ordenação (recentes, populares, rating)
- **Favoritos e seguir** — guardar agentes e acompanhar criadores
- **Clonar agente** — cópia privada com prompt, modelo e skills (sem knowledge base)
- **Página de detalhe** — stats, skills, criador, ações rápidas
- **Agent Builder** — visibilidade, categoria e tags para publicação

## Fase 4 — Skills Plugins ✅

- **HTTP Request** — chamadas REST com proteção SSRF, timeout e allowlist de hosts
- **SQL Query** — queries SELECT read-only via RPC `execute_readonly_sql`
- **Run Code** — JavaScript sandboxed (vm) para cálculos e transformações
- **Agent Builder** — secção Plugins com configuração de hosts permitidos
- **Auditoria** — invocações de plugins registadas em `audit_logs`

## Fase 5 — Flow Builder ✅

- **Editor visual** — canvas com nós arrastáveis (Trigger, Agente, Condição, Transform, Output)
- **Ligações** — conectar nós com edges SVG; ramificações true/false em condições
- **Execução** — motor topológico com logs por passo em `flow_run_steps`
- **Versionamento** — `flow_versions` com graph JSONB, publicar versões
- **Histórico** — `flow_runs` com status e steps detalhados

## Fase 6 — Enterprise ✅

- **Entra ID SSO** — login Microsoft via Supabase Azure provider (`NEXT_PUBLIC_ENTRA_ENABLED`)
- **Quotas mensais** — limites de tokens e custo por utilizador, enforced em chat e flows
- **Rate limiting** — req/min por endpoint via `rate_limit_buckets`
- **Auditoria** — backoffice com logs, gestão de roles e quotas
- **Cost rollups** — função `compute_cost_rollups` para agregação mensal

## Zona TVI BOX ✅

Feed vertical à DramaBox sobre a mesma base de utilizadores (`profiles`), com a identidade do TVI Player
(paleta escura, vermelho `#ca234d`, logótipo com corte diagonal azul/laranja/amarelo). Mobile-first: em ecrãs
pequenos ocupa o viewport; em desktop aparece dentro de uma moldura de telemóvel.

- **Rotas** — `/tvibox` (Para Ti), `/tvibox/series`, `/tvibox/series/[slug]`, `/tvibox/carteira`, `/tvibox/perfil`,
  `/tvibox/lista`, `/tvibox/entrar` (login com marca própria)
- **Economia** — moedas (bónus de boas-vindas, check-in diário com sequência, anúncios recompensados, pacotes
  simulados, TVI Box+), desbloqueio atómico via funções SQL `tvibox_*`
- **Social** — gostos, comentários, A Minha Lista, partilha, progresso/retomar, legendas e controlo parental
- **Catálogo** — 8 séries × EP1 grátis (produzido) + EP2 atrás do paywall; argumentos em `lib/tvibox/screenplays.ts`
- **Media** — bucket público `tvibox` (posters, vídeos, WebVTT)

### Produção de conteúdos

```bash
npm run tvibox:seed                                   # séries/episódios/argumentos → Supabase
npm run tvibox:animatic -- --frames <dir> --out <dir> # animatics 9:16 a partir de key frames (ffmpeg)
npm run tvibox:publish -- --posters <dir> --frames <dir> --videos <dir> --kind animatic
npm run tvibox:plan                                   # prompts Veo 3.1 + custo estimado (sem chamar a API)
GEMINI_API_KEY=... npm run tvibox:produce -- --series sangue --publish   # render final com voz PT-PT e lip sync
```

O pipeline `produce.ts` usa o **Veo 3.1** (Gemini API): abertura de 8 s + extensões de 7 s no mesmo vídeo
(continuidade de atores), 9:16, diálogo em português europeu gerado nativamente, genérico TVI BOX e
normalização de loudness. É resumível (`--from-step`) e regista o estado em `tvibox_render_jobs`.

## Setup

```bash
cp .env.example .env.local
# Preencher:
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   ANTHROPIC_API_KEY
#   VOYAGE_API_KEY  (recomendado para RAG semântico real)

npm install
npm run dev
```

## Migrations

```bash
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
| `/agents/[id]/chat` | Chat multimodal com streaming |
| `/admin` | Backoffice |
| `/api/knowledge/reindex` | Reindexar documento (POST) |
| `/api/health` | Diagnóstico (supabase, anthropic, voyage) |
| `/marketplace` | Catálogo de agentes públicos |
| `/marketplace/[id]` | Detalhe do agente no marketplace |
| `/api/marketplace` | Listagem com pesquisa e filtros (GET) |
| `/api/marketplace/[id]/clone` | Clonar agente (POST) |
| `/flows` | Lista de workflows |
| `/flows/[id]` | Flow Builder (editor visual) |
| `/api/flows/[id]/run` | Executar flow (POST) / histórico (GET) |

## Arquitetura

```
app/              → UI (route groups)
lib/ai/           → AI Gateway (Anthropic, Voyage embeddings, chunking)
lib/documents/    → Extração de texto + OCR (Fase 2)
lib/chat/         → Mensagens multimodais (Fase 2)
lib/skills/       → Skills Engine (registry, runner, core skills)
lib/supabase/     → SSR clients
lib/flows/        → Flow Engine (Fase 5)
```

## Roadmap

- **Fase 3** — Marketplace ✅
- **Fase 4** — Skills plugins (HTTP, SQL, Run Code) ✅
- **Fase 5** — Flow Builder ✅
- **Fase 6** — Enterprise (Entra ID, quotas, auditoria) ✅
