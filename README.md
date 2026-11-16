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
- **Importar novela** (Estúdio) — zip ou MP4s de uma novela já produzida → bucket privado `tvibox-imports` (TUS,
  retomável) → job em `tvibox_import_jobs` → worker `npm run tvibox:import -- --job <id>`: deteta a ordem pelo nome
  dos ficheiros, converte para H.264 faststart (AV1 não toca em iPhone), transcreve (faster-whisper), pede a Claude a
  ficha de cada episódio (título, sinopse, gancho, poster, resumo) e da série (título, género, sinopse, paleta,
  elenco), gera legendas WebVTT com nomes corrigidos e cria a série em rascunho; o admin revê e carrega em
  «Publicar todos os episódios». Também corre localmente: `npm run tvibox:import -- --zip novela.zip --publish`
- **Economia** — moedas (bónus de boas-vindas, check-in diário com sequência, anúncios recompensados, pacotes
  simulados, TVI Box+), desbloqueio atómico via funções SQL `tvibox_*`
- **Social** — gostos, comentários, A Minha Lista, partilha, progresso/retomar, controlo parental
- **Legendas** — desligadas por defeito; o botão **CC** no player liga-as só para a sessão (sessionStorage, sem
  persistência na conta). Os tempos vêm do alinhamento à fala real (`tvibox:align`), não do argumento
- **Catálogo** — 8 séries × EP1 grátis (produzido) + EP2 atrás do paywall; argumentos do EP1 em
  `lib/tvibox/screenplays.ts` e dos episódios seguintes em `lib/tvibox/screenplays-ep2.ts` (`getScreenplay(slug, n)`).
  Guiões completos (leitura editorial) em [`docs/tvibox-guioes-telenovelas.md`](docs/tvibox-guioes-telenovelas.md).
  Estimativa de visualizações só Portugal (1 série/dia, pessimista / normal / otimista):
  [`docs/tvibox-mercado-portugal.pdf`](docs/tvibox-mercado-portugal.pdf).
- **Media** — bucket público `tvibox` (posters, vídeos, WebVTT)

### Produção de conteúdos

```bash
npm run tvibox:seed                                   # séries/episódios/argumentos → Supabase
npm run tvibox:animatic -- --frames <dir> --out <dir> # animatics 9:16 a partir de key frames (ffmpeg)
npm run tvibox:publish -- --posters <dir> --frames <dir> --videos <dir> --kind animatic
npm run tvibox:plan                                   # prompts Veo 3.1 + custo estimado (sem chamar a API)
npm run tvibox:produce -- --check                     # valida GEMINI_API_KEY e o acesso ao modelo Veo
npm run tvibox:produce -- --series sangue --publish   # render final com voz PT-PT e lip sync (1 série primeiro)
npm run tvibox:produce -- --series sangue --episode 2 --model fast --publish   # episódio seguinte (precisa de argumento)
npm run tvibox:produce -- --publish --concurrency 3   # as 8 séries; resumível se falhar (repete o comando)
npm run tvibox:align -- --publish [--series a,b --ep 1 --model medium]  # legendas no instante exato da fala
npm run tvibox:import -- --job <id> | --zip novela.zip [--slug x --title "…" --publish --dry-run --limit N]  # novela pronta → série completa
```

`tvibox:align` extrai o áudio do render publicado, reconhece a fala com timestamps por palavra
(`scripts/tvibox/asr.py`, faster-whisper em CPU — `pip install faster-whisper`), alinha as falas do argumento às
palavras reconhecidas (`lib/tvibox/align.ts`) e publica um novo WebVTT. Falas que o Veo não disse ficam de fora;
o argumento completo fica guardado em `episodes/<slug>/epN.script.vtt` para repetir o processo. `tvibox:publish`
(e por isso `tvibox:produce --publish`) corre-o automaticamente para cada render final quando o faster-whisper está
instalado; correr à mão depois de substituir um vídeo no Estúdio.

Quotas Veo (preview): ~10 pedidos/dia por modelo — um episódio de 10 beats esgota um modelo; a cadeia pode ser
retomada com outro (`--model quality`) porque a extensão aceita qualquer vídeo Veo. Alternativa sem quota diária:
**Wan 3.0 (Higgsfield)** com referências de imagem das personagens (5 clips de 15 s, 2 beats por clip, ≈190 créditos
por episódio) — foi assim que se produziram *A Patroa* (EP1–EP2) e *Traição em Sintra* (EP1). Os episódios Wan são
montados com o mesmo genérico + loudnorm do `produce.ts` e publicados com `tvibox:publish --kind final`, que lê as
durações reais dos clips de `<videos>/state/<slug>-epN.json` para alinhar as legendas.

`GEMINI_API_KEY` vem de `.env.local` ou dos Secrets do Cursor (Cloud Agents → Secrets); os secrets só são
injetados em agentes **novos**, por isso o pipeline tem de correr num Cloud Agent iniciado depois de criar o segredo.

O pipeline `produce.ts` usa o **Veo 3.1** (Gemini API): abertura de 8 s + extensões de 7 s no mesmo vídeo
(continuidade de atores), 9:16, diálogo em português europeu gerado nativamente, genérico TVI BOX e
normalização de loudness. É resumível (`--from-step`) e regista o estado em `tvibox_render_jobs`.

## Zona Chartbeat · Diretos ✅

Audiência em direto (concurrents Chartbeat) dos lineares **TVI**, **CNN Portugal**, **TVI Reality**,
**TVI Ficção**, **TVI Internacional** e **V+ TVI**, com histórico ao minuto.

A Real-Time API da Chartbeat só devolve o *agora* (toppages, actualizado a ~3 s; limite 200 req/min/host).
O Advanced Queries (histórico) serve totais diários/semanais (pageviews, engaged time) — **não** concurrents ao minuto.
O histórico ao minuto é nosso: o pg_cron do Supabase chama `/api/cron/chartbeat-diretos` a cada minuto
e grava um snapshot em `chartbeat_channel_minutes`, mesmo com a página fechada. A conta Hobby da Vercel
só aceita crons diários, por isso o minuto não está no `vercel.json`.
Sem `CRON_SECRET` ou `CRON_SCHEDULER_SECRET` o handler responde 401 e o histórico só avança se alguém
tiver `/chartbeat` aberto. Autenticação Chartbeat: header `X-CB-AK` (o `?apikey=` da doc antiga está deprecated).

No TVI Player o mesmo linear aparece em vários paths (ex.: `/direto`, `/direto/tvi`, `/direto/TVI`,
app «Direto - TVI»). A CNN também entra pelo TVI Player (`/direto/cnn`) e por `cnnportugal.iol.pt/direto`.
A zona soma essas linhas no canal correspondente — não as trata como programas diferentes.

- **Rota** — `/chartbeat` (utilizadores autenticados). Gráfico de linhas (não empilhado) com
  granularidade ao minuto (ideal), por hora ou por dia (média, fuso de Lisboa). Por baixo, a
  composição do canal escolhido no mesmo minuto: origem (pesquisa, social, interno, direto, links),
  ecrã, fidelidade, engagement médio e estado do player (a reproduzir / pausa). «Exportar CSV»
  descarrega a série visível, com essas colunas por canal (separador `;`, BOM, Excel pt-PT).
  Admins podem forçar «Gravar este minuto».
- **Hosts** — `tviplayer.iol.pt`, `cnnportugal.iol.pt` (`CHARTBEAT_API_KEY`, header `X-CB-AK`).
- **Testes** — `npm test` (matching de aliases, agregação, rollup hora/dia, CSV).

## Escalas ✅ (app autónoma)

App de escalas com marca própria dentro da plataforma, sobre a mesma base de utilizadores
(`/escalas`, entrada em `/escalas/entrar`). Refeita a partir do protótipo HTML com tabelas
normalizadas no Supabase.

- **Acessos** — email + palavra-passe (Supabase Auth). Papéis da escala: Trabalhador (vê só a sua
  escala e os seus pedidos), Coordenação (grelha, pedidos, pessoas, conformidade, relatórios,
  configuração, registo, Excel) e Administração (também papéis, emails, contas da coordenação,
  importação). Admins da plataforma são Administração.
- **Contas** — criadas na ficha da pessoa com palavra-passe temporária; mudança obrigatória no
  primeiro acesso (`/conta/password`). Contas novas só veem as Escalas.
- **Acesso por funcionalidade** — `profiles.allowed_features` (NULL = tudo). Espelhado em
  `app_metadata` e aplicado no middleware (páginas e APIs) e no menu. Gerido no backoffice
  (`PATCH /api/admin/users` com `allowed_features`). Catálogo em `lib/features.ts`.
- **Modelo** — `escala_regras`, `escala_periodos`, `escala_grupos`, `escala_grupo_minimos`,
  `escala_slots`, `escala_necessidades`, `escala_necessidades_dia`, `escala_feriados`,
  `escala_pessoas`, `escala_pessoa_periodos`, `escala_alternancias`, `escala_ferias_saldo`,
  `escala_turnos`, `escala_ausencias`, `escala_ausencia_anexos` (bucket privado
  `escalas-comprovativos`), `escala_registo`.
- **Regras rígidas** (na base de dados): pessoa ativa, período no perfil, sem ausência aprovada,
  um turno por dia, ausências aprovadas sem sobreposição, exceção exige justificação. Aprovar uma
  ausência retira os turnos em conflito na mesma transação.
- **Regras flexíveis** (motor em `lib/escalas/motor.ts`, revalidadas no servidor em
  `/api/escalas/turnos`): descanso, dias seguidos, folgas na janela, horas semanais, fds,
  pedido pendente, piquete prolongado. Forçar exige justificação e fica registado.
- **Sugestão, compensações, conformidade, relatórios** — adaptados do protótipo; feriados
  nacionais 2026–2027 carregados e excluídos dos dias úteis.
- **Excel** — exportação/importação com as folhas do protótipo (Pessoas, Grupos, Slots,
  Necessidades, Necessidades por dia, Ausências, Turnos, Feriados, Definições).
- **Testes** — `npx vitest run tests/unit/escalas`.

## Setup

```bash
cp .env.example .env.local
# Preencher:
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   ANTHROPIC_API_KEY
#   VOYAGE_API_KEY  (recomendado para RAG semântico real)
#   CHARTBEAT_API_KEY  (zona /chartbeat — também na Vercel, Production + Preview)
#   CRON_SECRET        (obrigatório na Vercel Production + Preview; o Cron envia Bearer)

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
| `/chartbeat` | Audiência ao minuto dos diretos Chartbeat (TVI Player + CNN Portugal) |
| `/escalas` | App de escalas (grelha, pedidos, conformidade, área do trabalhador) |
| `/api/chartbeat/live` | Snapshot actual (toppages Chartbeat, canais agregados) |
| `/api/chartbeat/history` | Série histórica (`?range=6h\|24h\|7d\|30d&grain=minute\|hour\|day`) |
| `/api/chartbeat/export` | CSV da série (`?range=&grain=`, `;` + BOM) |
| `/api/chartbeat/ingest` | Gravar este minuto (POST, admin) |
| `/api/cron/chartbeat-diretos` | Snapshot ao minuto (pg_cron, Bearer) |

## Arquitetura

```
app/              → UI (route groups)
lib/ai/           → AI Gateway (Anthropic, Voyage embeddings, chunking)
lib/documents/    → Extração de texto + OCR (Fase 2)
lib/chat/         → Mensagens multimodais (Fase 2)
lib/skills/       → Skills Engine (registry, runner, core skills)
lib/supabase/     → SSR clients
lib/flows/        → Flow Engine (Fase 5)
lib/chartbeat/    → Chartbeat Diretos: toppages, agregação de canais, ingest ao minuto
mcp/              → Servidor MCP remoto/stdio
```

## Roadmap

- **Fase 3** — Marketplace ✅
- **Fase 4** — Skills plugins (HTTP, SQL, Run Code) ✅
- **Fase 5** — Flow Builder ✅
- **Fase 6** — Enterprise (Entra ID, quotas, auditoria) ✅
