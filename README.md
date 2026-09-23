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
  «Publicar todos os episódios». Também corre localmente: `npm run tvibox:import -- --zip novela.zip --publish`.
  Zips grandes (~700 MB) precisam do limite global do Storage acima do tamanho do ficheiro (o TUS devolve 413 se o
  «Global file size limit» do projeto for mais baixo, p.ex. 50 MB no plano Free); nesse caso usa `--zip` no worker.
- **Economia** — moedas (bónus de boas-vindas, check-in diário com sequência, anúncios recompensados, pacotes
  simulados, TVI Box+), desbloqueio atómico via funções SQL `tvibox_*`
- **Social** — gostos, comentários, A Minha Lista, partilha, progresso/retomar, controlo parental
- **Legendas** — desligadas por defeito; o botão **CC** no player liga-as só para a sessão (sessionStorage, sem
  persistência na conta). Os tempos vêm do alinhamento à fala real (`tvibox:align`), não do argumento
- **Catálogo** — 8 séries × EP1 grátis (produzido) + EP2 atrás do paywall; argumentos do EP1 em
  `lib/tvibox/screenplays.ts` e dos episódios seguintes em `lib/tvibox/screenplays-ep2.ts` (`getScreenplay(slug, n)`).
  Guiões completos (leitura editorial) em [`docs/tvibox-guioes-telenovelas.md`](docs/tvibox-guioes-telenovelas.md).
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

## Zona PT26 · Tracking poll ✅

Sondagem semanal (8 perguntas fixas) para televisão em direto. A produção importa o Excel semanal num
back-office (só admins) e publica a semana; o pivot usa um ecrã tátil em estúdio (`/pt26/live`) que
reproduz o protótipo `pt26-tracking-poll.html` (fundo azul PORTUGAL26, fonte Sora, barras, saldo, gráfico
de linhas SVG). Construída sobre a infra GMC (Supabase Postgres + Storage, Vercel) em vez de Prisma/Docker.

- **Rotas** — `/pt26/live?key=<token>` (pivot, sem login, token das Definições; um único `GET /api/pt26/live`
  ao abrir, imagens pré-carregadas, cache em `localStorage` com indicador discreto se a API falhar),
  `/pt26/live/preview` (igual, inclui rascunhos; sessão admin), `/admin/pt26` (back-office; admins)
- **Back-office** — Semanas (lista, **Importar Excel** com pré-visualização → confirmar, editar valores à mão,
  publicar/despublicar, apagar), Pessoas (CRUD, aliases, **fotografia** com recorte quadrado → 256/800 px WEBP
  via `sharp`, pré-visualização do avatar circular, lista de itens dos imports sem correspondência → criar pessoa
  ou adicionar alias), Partidos (sigla, cor, logótipo PNG/SVG, ordem), Perguntas (título/subtítulo), Definições
  (token do ecrã, rodapé/fonte da sondagem, ano do logo)
- **Excel** — um ficheiro = uma semana; sheets `P1`…`P8` (aceita `Pergunta 1`, `1`, `Q1`…); colunas `Quadro`,
  `Pessoa`, `Item`, `Valor`, `Titulo`; vírgula ou ponto, `%` opcional, negativos. Erros bloqueantes (sheet em
  falta, item vazio, valor não numérico, respostas em falta) vs. avisos (soma fora de 95–105, item sem match,
  semana já existente). Template em `GET /api/pt26/admin/import/template`. Exemplos em `samples/pt26/`
  (`npm run pt26:samples` regenera-os a partir de `lib/pt26/samples.ts`)
- **Dados** — `pt26_*` (partidos, pessoas, perguntas, semanas, quadros, resultados, import logs, previews,
  definições); RLS só admin; import atómico via RPC `pt26_replace_week`; variações (▲/▼) e saldo calculados no
  servidor (`lib/pt26/live.ts`); bucket público `pt26` para fotos/logótipos
- **Testes** — `npm test` (parser, deltas/saldo, histórico) e `npm run test:e2e` (Playwright: importa o Excel de
  exemplo, publica e verifica em `/pt26/live`; precisa de `PT26_E2E_EMAIL`/`PT26_E2E_PASSWORD` de um admin e da
  app a correr em `PT26_E2E_BASE_URL`)

### Operação semanal (produção)

1. **Importar** — `/admin/pt26` → Semanas → «Importar Excel»: escolhe a data (o rótulo «Semana N» é sugerido),
   carrega o `.xlsx` e clica «Pré-visualizar». Erros a vermelho bloqueiam; avisos a amarelo não. «Confirmar
   import» grava tudo numa transação e deixa a semana em **Rascunho** (reimportar a mesma data substitui).
2. **Validar** — «Pré-visualização (inclui rascunhos)» abre o ecrã do pivot com a semana nova; corrige valores
   à mão em «Valores» se for preciso (itens, ordem, títulos dos quadros).
3. **Publicar** — «Publicar» na linha da semana. Só semanas publicadas chegam ao ecrã do pivot.
4. **Fotografias** — Pessoas → escolhe a pessoa → «Carregar foto» → enquadra no recorte → «Guardar fotografia».
   Nomes do Excel que não coincidem aparecem em «Itens sem correspondência»: cria a pessoa ou associa como alias
   e clica «Reemparelhar».
5. **Ecrã** — Definições → copiar o «URL do ecrã» para o browser do ecrã tátil (Chromium, F11, 1920×1080).
   Atalhos: ←/→ quadros, ↑/↓ perguntas, `H` histórico, `Esc` início, `1`–`8` pergunta.

## Zona Chartbeat · Diretos ✅

Audiência em direto (concurrents Chartbeat) dos lineares **TVI**, **CNN Portugal**, **TVI Reality**,
**TVI Ficção**, **TVI Internacional** e **V+ TVI**, com histórico ao minuto.

A Real-Time API da Chartbeat só devolve o *agora* (toppages, actualizado a ~3 s; limite 200 req/min/host).
O Advanced Queries (histórico) serve totais diários/semanais (pageviews, engaged time) — **não** concurrents ao minuto.
O histórico ao minuto é nosso: um cron Vercel (`* * * * *` → `/api/cron/chartbeat-diretos`) grava um snapshot
em `chartbeat_channel_minutes` em produção, mesmo com a página fechada. Sem `CRON_SECRET` na Vercel o handler
responde 401 e o histórico só avança se alguém tiver `/chartbeat` aberto (persistência no live). Autenticação
Chartbeat: header `X-CB-AK` (o `?apikey=` da doc antiga está deprecated).

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

## Zona Escalas ✅

Escala semanal da redação. As regras de descanso são o funcionamento normal — não são
bloqueios absolutos. A app respeita-as por omissão, avisa quando são violadas e deixa o
coordenador gravar a exceção com justificação.

Decisões fechadas:

- O **S6** (17:00–02:00) conta como **um dia de trabalho**, o dia em que começa. O turno do
  dia 10 que acaba às 02:00 do dia 11 não ocupa o dia 11. As horas a mais não entram no
  limite semanal: todos os turnos contam `duracaoPadraoTurnoHoras`.
- **Férias e folgas são distintas.** Folga é um dia sem turno e sem férias ou ausência
  aprovada. Férias aprovadas bloqueiam o turno (regra absoluta) e não contam para as 4
  folgas da janela.

- **Rotas** — `/escalas` (grelha semanal; jornalistas consultam, coordenadores atribuem),
  `/api/escalas` (quadro), `/api/escalas/atribuicoes`, `/api/escalas/lote`,
  `/api/escalas/sugerir`, `/api/escalas/settings`, `/api/escalas/ausencias`
- **Regras absolutas** — turno fora do perfil, férias/ausência aprovada, segundo turno no
  mesmo dia. Nunca são gravadas.
- **Regras flexíveis** — dias consecutivos, folgas na janela deslizante de 14 dias,
  descanso entre turnos, horas semanais. O aviso aparece no painel antes de confirmar; o
  botão passa a «Atribuir mesmo assim» e exige justificação, gravada na atribuição e no
  `audit_logs`.
- **Sugestão** — não propõe violações flexíveis se houver outro candidato. Com escassez,
  propõe a exceção em vez de deixar o lugar vazio, e nunca viola uma regra absoluta. A
  pré-visualização separa bloqueios (saltados) e avisos (incluídos, com opção de os excluir).
  `preferirFolgasAgrupadas` inverte a preferência de folgas espaçadas para blocos.
- **Contas de exemplo** — `npm run escalas:seed` (palavra-passe `gmc123`)

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
| `/clips` | Lista de vídeos e jobs de sugestão de clips |
| `/clips/novo` | Upload direto (TUS) + parâmetros |
| `/clips/[jobId]` | Fila de candidatos: preview, ajuste in/out, aprovar/rejeitar |
| `/api/clips/uploads` | Regista `video_assets` e devolve destino TUS (POST) |
| `/api/clips/jobs` | Enfileira job (POST) / lista (GET) |
| `/api/clips/candidates/[id]` | Ajusta in/out com re-snap (PATCH) |
| `/api/clips/candidates/[id]/decision` | Aprova/rejeita → `clip_decisions` (+ render) (POST) |
| `/api/clips/renders/[id]/download` | Signed URL curta do MP4, só se `done` (GET) |
| `/api/cron/clips-watchdog` | Requeue de leases expirados (Bearer `CRON_SECRET`) |
| `/chartbeat` | Audiência ao minuto dos diretos Chartbeat (TVI Player + CNN Portugal) |
| `/escalas` | Escala semanal da redação (folgas, descanso, exceções) |
| `/api/chartbeat/live` | Snapshot actual (toppages Chartbeat, canais agregados) |
| `/api/chartbeat/history` | Série histórica (`?range=6h\|24h\|7d\|30d&grain=minute\|hour\|day`) |
| `/api/chartbeat/export` | CSV da série (`?range=&grain=`, `;` + BOM) |
| `/api/chartbeat/ingest` | Gravar este minuto (POST, admin) |
| `/api/cron/chartbeat-diretos` | Cron ao minuto (Bearer `CRON_SECRET`) |
| `/pt26/live` | Ecrã do pivot PT26 (token `?key=`), `/pt26/live/preview` inclui rascunhos (admin) |
| `/admin/pt26` | Back-office PT26: semanas/import, pessoas, partidos, perguntas, definições (admin) |
| `/api/pt26/live` | Payload completo do ecrã (semanas publicadas, deltas, imagens) — token ou sessão admin |
| `/api/pt26/admin/import/{preview,commit,template}` | Import do Excel em duas fases + template |
| `/api/pt26/admin/{weeks,people,parties,questions,settings}` | CRUD do back-office (admin) |

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
lib/pt26/         → PT26: parser Excel, matching, payload live (deltas/saldo), histórico, template
lib/chartbeat/    → Chartbeat Diretos: toppages, agregação de canais, ingest ao minuto
worker/           → Worker em container (GPU): ffmpeg + WhisperX + fila de jobs/renders
mcp/              → Servidor MCP remoto/stdio
```

## Roadmap

- **Fase 3** — Marketplace ✅
- **Fase 4** — Skills plugins (HTTP, SQL, Run Code) ✅
- **Fase 5** — Flow Builder ✅
- **Fase 6** — Enterprise (Entra ID, quotas, auditoria) ✅
