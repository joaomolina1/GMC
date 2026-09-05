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

- **Rotas** — `/tvibox` (Para Ti: um banner por série, pré-visualização muda), `/tvibox/ver/[slug]` (player imersivo:
  EP1 → EP2 → EP3 por scroll, sem texto sobre o vídeo, paywall no episódio bloqueado), `/tvibox/series`,
  `/tvibox/series/[slug]`, `/tvibox/carteira`, `/tvibox/perfil`, `/tvibox/lista`, `/tvibox/entrar` (login com marca própria)
- **Estúdio (backoffice)** — `/admin/tvibox` (admins): criar/editar séries e episódios, upload direto de vídeo 9:16,
  poster e legendas WebVTT para o Storage (URL assinado), estados Rascunho / Em breve (cliffhanger) / Publicado
- **Economia** — moedas (bónus de boas-vindas, check-in diário com sequência, anúncios recompensados, pacotes
  simulados, TVI Box+), desbloqueio atómico via funções SQL `tvibox_*`
- **Social** — gostos, comentários, A Minha Lista, partilha, progresso/retomar, controlo parental
- **Legendas** — desligadas por defeito; o botão **CC** no player liga-as só para a sessão (sessionStorage, sem
  persistência na conta). Os tempos vêm do alinhamento à fala real (`tvibox:align`), não do argumento
- **Catálogo** — 8 séries × EP1 grátis (produzido) + EP2 atrás do paywall; argumentos em `lib/tvibox/screenplays.ts`
- **Media** — bucket público `tvibox` (posters, vídeos, WebVTT)

### Produção de conteúdos

```bash
npm run tvibox:seed                                   # séries/episódios/argumentos → Supabase
npm run tvibox:animatic -- --frames <dir> --out <dir> # animatics 9:16 a partir de key frames (ffmpeg)
npm run tvibox:publish -- --posters <dir> --frames <dir> --videos <dir> --kind animatic
npm run tvibox:plan                                   # prompts Veo 3.1 + custo estimado (sem chamar a API)
npm run tvibox:produce -- --check                     # valida GEMINI_API_KEY e o acesso ao modelo Veo
npm run tvibox:produce -- --series sangue --publish   # render final com voz PT-PT e lip sync (1 série primeiro)
npm run tvibox:produce -- --publish --concurrency 3   # as 8 séries; resumível se falhar (repete o comando)
npm run tvibox:align -- --publish [--series a,b --ep 1 --model medium]  # legendas no instante exato da fala
```

`tvibox:align` extrai o áudio do render publicado, reconhece a fala com timestamps por palavra
(`scripts/tvibox/asr.py`, faster-whisper em CPU — `pip install faster-whisper`), alinha as falas do argumento às
palavras reconhecidas (`lib/tvibox/align.ts`) e publica um novo WebVTT. Falas que o Veo não disse ficam de fora;
o argumento completo fica guardado em `episodes/<slug>/epN.script.vtt` para repetir o processo. Correr sempre
depois de `tvibox:produce` ou de substituir um vídeo no Estúdio.

`GEMINI_API_KEY` vem de `.env.local` ou dos Secrets do Cursor (Cloud Agents → Secrets); os secrets só são
injetados em agentes **novos**, por isso o pipeline tem de correr num Cloud Agent iniciado depois de criar o segredo.

O pipeline `produce.ts` usa o **Veo 3.1** (Gemini API): abertura de 8 s + extensões de 7 s no mesmo vídeo
(continuidade de atores), 9:16, diálogo em português europeu gerado nativamente, genérico TVI BOX e
normalização de loudness. É resumível (`--from-step`) e regista o estado em `tvibox_render_jobs`.

## Fase 7 — Clips (Fase 1: arquivo/VOD) 🚧

Sugestão automática de clips a partir de vídeo de arquivo. O módulo **sugere** — nunca
publica: um editor humano revê, ajusta e aprova antes de existir qualquer ficheiro.

- **Upload direto** browser → Supabase Storage (TUS resumable, bucket privado `clips`) — o
  ficheiro nunca passa pela API da Vercel (limite ~4,5 MB por request)
- **Fila real** em `clip_jobs` (`FOR UPDATE SKIP LOCKED`, lease, tentativas, watchdog em
  `/api/cron/clips-watchdog`); a Vercel só enfileira e serve a UI
- **Worker em container com GPU** (`worker/`): ffmpeg (probe, áudio, cortes de plano, frames,
  render), WhisperX `large-v3` + pyannote (transcrição com timestamps por palavra e oradores)
- **Sugestão com Claude** por janela de transcrição (`lib/clips/suggest.ts`): resposta validada
  com Zod, timestamps clampados ao transcript, snapping determinístico a fronteiras de
  frase/palavra/corte de plano (`lib/clips/boundaries.ts`), dedup entre janelas
- **Validação visual opcional** dos melhores candidatos com 2–3 frames JPEG (nunca o vídeo)
- **Prompts versionados** em `lib/clips/prompts/` (primeira convenção do repo; teste de
  snapshot obriga a bump de `version`)
- **Guarda humana na BD**: trigger `clip_renders_require_approval` recusa renders de candidatos
  não aprovados, também para o service role; `clip_decisions` é append-only e alimenta a
  reordenação futura
- **UI** em `/clips`: lista de jobs, upload, fila de candidatos com preview, ajuste fino de
  in/out (re-snap no servidor), aprovar/rejeitar com motivo, download do MP4 com legendas

Fora de âmbito (`TODO(fase-2)`): direto/live, publicação automática, reordenação de candidatos
com base no histórico de `clip_decisions`.

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
| `/clips` | Lista de vídeos e jobs de sugestão de clips |
| `/clips/novo` | Upload direto (TUS) + parâmetros |
| `/clips/[jobId]` | Fila de candidatos: preview, ajuste in/out, aprovar/rejeitar |
| `/api/clips/uploads` | Regista `video_assets` e devolve destino TUS (POST) |
| `/api/clips/jobs` | Enfileira job (POST) / lista (GET) |
| `/api/clips/candidates/[id]` | Ajusta in/out com re-snap (PATCH) |
| `/api/clips/candidates/[id]/decision` | Aprova/rejeita → `clip_decisions` (+ render) (POST) |
| `/api/clips/renders/[id]/download` | Signed URL curta do MP4, só se `done` (GET) |
| `/api/cron/clips-watchdog` | Requeue de leases expirados (Bearer `CRON_SECRET`) |

## Arquitetura

```
app/              → UI (route groups)
lib/ai/           → AI Gateway (Anthropic, Voyage embeddings, chunking)
lib/documents/    → Extração de texto + OCR (Fase 2)
lib/chat/         → Mensagens multimodais (Fase 2)
lib/skills/       → Skills Engine (registry, runner, core skills)
lib/supabase/     → SSR clients
lib/flows/        → Flow Engine (Fase 5)
lib/clips/        → Clips: snapping, janelas, legendas, prompts, sugestão (Fase 7)
worker/           → Worker em container (GPU): ffmpeg + WhisperX + fila de jobs/renders
mcp/              → Servidor MCP remoto/stdio
```

## Roadmap

- **Fase 3** — Marketplace ✅
- **Fase 4** — Skills plugins (HTTP, SQL, Run Code) ✅
- **Fase 5** — Flow Builder ✅
- **Fase 6** — Enterprise (Entra ID, quotas, auditoria) ✅
