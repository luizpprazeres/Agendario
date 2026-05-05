# Agendario · Changelog do dia

**Data:** 2026-05-05
**Commits:** 15 (11 features, 4 docs/handoffs)
**Sessões paralelas:** 3 terminais coordenados (main, agenda, Code#4)

---

## Em uma frase

O Agendario passou de pipeline backend funcional a **app instalável no iPhone** com **dashboard premium**, **OCR de fatura via foto** e **sync com Google Calendar** — em um único dia.

---

## Dashboard

Antes você só via uma tela de diagnóstico do sistema. Agora você abre `/dashboard` e tem o **cockpit pessoal** do mês:

- **Saldo total** com sparkline cumulativo dos últimos 30 dias
- **Resumo do mês corrente** — receitas, gastos, líquido (verde/vermelho/neutro conforme sinal)
- **Próximo plantão** em destaque (gradient emerald, hospital, horário, pagamento)
- **"Onde foi"** — top 5 categorias de gasto com swatch colorido e barra proporcional
- **Atividade recente** — últimas 8 transações com avatar tinted da cor da categoria
- **Próximos plantões** — lista com data destacada à esquerda e horário à direita
- **Assinaturas** — quantas ativas, total mensal normalizado, próxima cobrança em amber se ≤3d

Visual: dark mode warm (zinc tintado), tipografia Mona Sans com peso editorial (`font-stretch: 90%`), cards `rounded-3xl` generosos, tabular-nums religioso em valores monetários.

> Inspirado em Notion + Firefly III + Copilot Money — um cockpit financeiro com polish premium e modularidade de blocos.

---

## Captura

### Auto-categorização de transações
Quando você manda "gastei 150 no restaurante micale" pelo bot, o Agendario agora **infere a categoria automaticamente** via LLM. Confiança ≥ 0.6 categoriza direto; abaixo disso fica pendente em inbox. Validado: "restaurante micale" → `Restaurantes` no primeiro tiro.

### OCR de faturas (web + Telegram)
Você pode mandar a fatura do cartão como **foto ou PDF** e o Agendario extrai todas as transações automaticamente:

- **Web:** acesse `/importar`, drag-drop o arquivo (até 25MB)
- **Telegram:** mande a foto/PDF direto pro bot — ele responde com link pro review

Pipeline:
1. Upload pra Supabase Storage privado (`receipts` bucket, RLS por usuário)
2. Hash SHA-256 do arquivo → dedupe automático (mesma fatura 2x retorna o batch existente)
3. Extração via **gpt-4.1-mini com vision** — identifica linhas reais (filtra saldo anterior, totais, headers)
4. Detecta parcelamentos ("MACBOOK 3/12" → preenche `installment_current`/`total`)
5. Categorização sugerida + **aprendizagem de aliases** ("AMZN MKTP BR" vira "Amazon" depois que você editar uma vez)
6. Detecção de duplicatas — compara contra suas últimas 200 transactions, marca em amber
7. Você revisa em `/importar/{batch_id}` (checkbox por linha, edição inline, escolha da conta)
8. Confirma → cria N transactions de uma vez

Custo estimado: ~$0.03 por fatura.

---

## Integrações

### Google Calendar (one-way)
Conecte sua conta Google em `/conectar-google`, escolha em qual calendário receber os plantões, e **cada plantão confirmado pelo bot vira um evento automaticamente**:

- OAuth flow completo com `prompt=consent` pra garantir refresh_token
- Token refresh automático (você não precisa reautorizar)
- Toggle por calendário — sync ativo só nos que você marcar (default: primary)
- Idempotência: se o evento for deletado no Google, o próximo sync recria; se você mexer, preserva o `gcal_event_id` e atualiza
- Disconnect com revoke real do token

Sync reverso (GCal → App) e watch channels permanecem fase 2 — o schema já suporta.

---

## Plataforma

### Login web
Antes era só captura por Telegram. Agora você acessa `/login` (email + senha), entra direto no `/dashboard`. Auth via **Supabase SSR** (`@supabase/ssr`), middleware refresca a sessão a cada request, signout via server action.

### App instalável (PWA)
**Adicione à tela inicial do iPhone** e o Agendario abre em standalone (sem barra do Safari):

- `/manifest.webmanifest` gerado via Next App Router
- Ícone 192×192 (PWA) e 180×180 (Apple) renderizados dinamicamente via `ImageResponse` — wordmark "ag" sobre dark com border emerald sutil
- Service worker simples: cache-first em assets estáticos, network-first com fallback ao cache em páginas, passthrough em webhooks
- Status bar `black-translucent` + `viewport-fit: cover` pra notch
- Resolve os 404 antigos de `/manifest.json` e `/sw.js`

### Insights automáticos
Todo dia 1º do mês às **6h da manhã (horário de Recife)**, o Agendario:

1. Identifica usuários com transações no mês anterior
2. Calcula stats: receitas, gastos, top 5 categorias, top 3 hospitais, total dedutível carnê-leão
3. Pede ao **gpt-4o** 2 frases curtas comentando o resumo (parceiro analítico, não marketing)
4. Salva em `insights` (kind=`monthly_summary`)
5. Manda mensagem no Telegram com o resumo formatado

Custo: ~$0.001 por usuário por mês.

> Disparo manual também disponível via evento Inngest `insights/monthly.generate` pra regerar sob demanda.

---

## Sob o capô

Para quem programa, o que entrou na infra hoje:

- **2 commits de schema:** `subscriptions` (4 índices, RLS) e `inbox_batches` + `inbox_batch_items` + `description_aliases` (com `uniqueIndex` em aliases pra `onConflictDoUpdate`)
- **1 schema atualizado:** `google_calendar_tokens` + `google_calendars` + `google_calendar_watches` (já existiam, só conectados)
- **5 Inngest functions novas:**
  - `parseInboxItem`, `confirmInboxItem`, `categorizeTransactionFn` (já existiam, ajustadas)
  - `syncShiftToGcal` (escuta `gcal/sync-push`, filtra `entity_table='shifts'`)
  - `extractReceiptFn` (escuta `receipts/extract-requested`, vision LLM, salva items)
  - `generateMonthlyInsightsCron` + `generateMonthlyInsightsOnDemand`
- **Service-role client** novo (`lib/supabase/admin.ts`) pra operações server-side que precisam bypassar RLS (Storage uploads, Inngest)
- **Tipografia variável:** Mona Sans (web) com `font-feature-settings: "ss02", "cv09"` e `font-stretch: 90-92%` em títulos pra peso editorial

---

## Pipeline pra próximas sessões

7 handoffs auto-contidos enfileirados em `docs/`:

| Handoff | Estado |
|---|---|
| `subscriptions` | ✅ executado e mergeado |
| `bills` | aguardando agenda |
| `quick-add` | aguardando agenda (depende de bills) |
| `credit-cards` | em curso pelo agenda (worktree separada) |
| `tasks-dashboard` | aguardando agenda (depende de cards) |
| `gcal-sync` | ✅ executado e mergeado |
| `receipt-ocr` | ✅ executado e mergeado pelo Code#4 |
| `expense-templates` | aguardando |

Cada handoff tem 6 seções (objetivo, contexto, ordem dos passos, perguntas em aberto, artefatos, tom) — auto-contido pra qualquer terminal Claude pegar e executar sem perder contexto.

---

## Métricas do dia

- **Commits:** 15
- **Linhas adicionadas:** ~10.000+ (incluindo handoffs e mocks)
- **Features user-facing:** 11
- **Esquemas novos:** 4 tabelas (subscriptions, inbox_batches, inbox_batch_items, description_aliases)
- **Inngest functions novas:** 4
- **Páginas novas:** `/login`, `/dashboard`, `/importar`, `/importar/[batch_id]`, `/conectar-google`
- **Modelos LLM em uso:** gpt-4o-mini (parse + categorize), gpt-4.1-mini (vision), gpt-4o (insights)
- **Terminais paralelos coordenados:** 3 (via Maestri)

---

## O que ainda não entrou

- **Bills, Quick Add web, Cartões de crédito, Tasks no dashboard, Despesas favoritas** — handoffs prontos, fila de execução
- **Sync reverso GCal→App** (fase 2)
- **PDF rendering pra OCR multi-página** — limitado a 1 página por enquanto
- **Insights de anomalia, forecast de fluxo, carnê-leão export** — schema suporta, lógica fase 2
- **Página `/favoritos`** — templates só via seed agora
- **Settings page** com gestão de contas, hospitais, categorias, regras

---

**Próxima sessão:** terminar a fila do dashboard (bills → quick-add → cards → tasks → favoritos), depois revisitar refactor em `_components/` se o page.tsx ficar > 1000 linhas.
