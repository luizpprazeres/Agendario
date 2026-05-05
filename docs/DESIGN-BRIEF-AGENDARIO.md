# Brief de Design — Agendario

**Para:** Claude Design (frontend-design / impeccable)
**Data:** 2026-05-05
**Origem:** Sessão de brainstorming com o usuário (Luiz, intensivista brasileiro)

> **Use este documento como prompt principal.** Tudo que você precisa pra projetar a interface está aqui — visão, persona, dados reais, personalidade visual, layouts, componentes e o que entregar.

---

## 1. Visão / endgoal

O Agendario é um **workspace pessoal médico + financeiro** pra um intensivista brasileiro. A captura de dados acontece **principalmente via Telegram** (mensagens em linguagem natural são parseadas por LLM, vira preview com botões, vira entidade no banco). A web é onde ele **visualiza, controla e analisa** tudo.

A meta dessa interface não é "uma dashboard" — é **a melhor dashboard pessoal de todas**: combinando a **densidade financeira do Firefly III**, o **polish premium e o feel native do Copilot Money**, e a **modularidade de blocos + multiple views do Notion**. Mobile-first sem ser mobile-only — tem que funcionar lindo numa tela de iPhone (uso 80% do tempo, no plantão) e expandir bem em desktop (uso 20% do tempo, em casa, fim de semana).

O usuário **quer ver tudo de relance** ao abrir o app, mas com **drill-down infinito** quando quer investigar. Quer que o sistema sugira insights sem encher de notificações. Quer **capturar com 1 toque** ações repetidas e quer **executar com 1 atalho** ações comuns.

---

## 2. Persona — Luiz

- **Profissão:** médico intensivista, plantonista em hospitais públicos e privados em Recife
- **Vida financeira:** múltiplos plantões/mês com valores diferentes por hospital, conta PJ + PF, cartão de crédito principal + adicional, despesas dedutíveis carnê-leão (consultórios, congressos, equipamentos, plano)
- **Contextos de uso:**
  - **Mobile (80%):** entre plantões, em deslocamento, antes de dormir. Quer registrar gasto, ver saldo, conferir próximo plantão, marcar tarefa
  - **Desktop (20%):** finais de semana, fechamento mensal, declaração de carnê-leão, planejamento
- **Comportamento:** captura tudo via Telegram (`@agendariomestre_bot`) durante o dia. Volta na web pra **conferir, corrigir, drilldown e relatórios**
- **Tom de voz UI:** português brasileiro, conciso, sem infantilizar ("Sair", não "Tchau!"). Sem emojis decorativos.

---

## 3. Personalidade visual — Notion + Firefly III + Copilot Money

### A síntese
- **De Copilot Money:** premium polish, animações sutis e prazerosas, tipografia caprichada, gráficos lindos, **native feel iOS**, cores funcionais delicadas (não saturadas)
- **De Firefly III:** densidade de informação, drill-downs profundos, multi-account real, rules engine visível, transações em tabela rica
- **De Notion:** blocos modulares rearranjáveis, **multiple views por entidade** (calendar, table, kanban, gallery, list), command palette (Cmd+K), home customizável

### Paleta
- **Base:** dark mode default (`zinc-950` background) com light mode alternativo equally polished
- **Surface 1:** `zinc-900/50` (cards), **Surface 2:** `zinc-900` (modais/drawers), **Border:** `zinc-800`
- **Texto:** `zinc-100` primário, `zinc-400` secundário, `zinc-500` terciário
- **Funcionais:**
  - 🟢 Receita / positivo: `emerald-400` (não verde-vivo)
  - 🔴 Despesa / negativo: `red-400`
  - 🟡 Atenção / pendente: `amber-400`
  - 🔵 Link / ação: `sky-400`
  - 🟣 Insight / IA: `violet-400`
- **Categorias** usam cores próprias do banco (`categories.color`) com 50% opacity em backgrounds e full opacity em badges
- **Sem gradientes berrantes.** Brilho/glow APENAS em estados hover de cards interativos.

### Tipografia
- **Display/Headings:** `Inter` ou `Geist` 600/700 (o que você já tem com melhor renderização)
- **Body:** `Inter` 400/500
- **Numbers:** `tabular-nums` SEMPRE em valores monetários, datas, contadores
- **Mono:** `JetBrains Mono` ou `Geist Mono` em códigos, IDs, chaves Pix
- Hierarquia tight: `text-2xl font-semibold` (page title) → `text-sm font-medium` (section header) → `text-xs text-zinc-500` (label/caption)

### Densidade
- **Density toggle global:** Comfortable (default desktop) / Compact (default mobile dense)
- **Espaçamento:** múltiplos de 4. Cards `p-4` (compact) / `p-5` (comfortable)
- **Mais informação por pixel** que Notion, **mais polish que Firefly**

### Movimento
- **Framer Motion** sutil: fade+slide 200ms ease-out em entradas
- **Gestos:** swipe horizontal em listas (right=confirma, left=delete) no mobile
- **Pull-to-refresh** com haptic feedback (mobile)
- **Skeleton loaders** com shimmer leve
- **Sem confetes.** Sem zoom dramático. Sem hover float.

### Iconografia
- **Lucide Icons** apenas (nunca Heroicons junto). Stroke 1.5
- **Nenhum ícone decorativo.** Só funcionais.
- Categorias podem ter emoji (vem do banco) — exibir tal qual.

---

## 4. Domínios de informação (5 áreas)

```
┌──────────────────────────────────────────────────────────┐
│  HOME (hub) — overview de tudo                           │
└─┬────────┬─────────┬────────┬─────────┬─────────────────┘
  │        │         │        │         │
  ▼        ▼         ▼        ▼         ▼
Finanças  Agenda   Tasks   Inbox   Insights
  $        🩺       ✓        📥        💡
```

### A) Finanças (cockpit principal)
- Contas (PJ, PF, poupança)
- Cartões de crédito (fatura aberta, próxima, limite, parcelamentos)
- Transações (income, expense, transfer)
- Categorias hierárquicas
- **Assinaturas** (recurring subscriptions detectadas)
- **Bills/contas a pagar** (boletos, vencimentos)
- **Despesas favoritas** (templates 1-clique)
- **Tags cross-category** ("viagem 2026", "reforma")
- **Splits** (divisão com terceiros)
- **Reembolsos a receber** (valores pendentes)
- **Pix favoritos**
- Budgets (orçamento por categoria/mês)
- Goals (metas de economia)
- Rules (regras de categorização auto)
- **Carnê-leão tracker** (acumulado dedutível mensal/anual + export PDF)

### B) Agenda médica
- Plantões (instâncias com `starts_at`, `ends_at`, `pay_cents`, hospital, status)
- Workplaces (hospitais, clínicas)
- Templates recorrentes (ex: "Albert Einstein 19h-7h sábado")
- Sync bidirecional Google Calendar
- Status de pagamento (pago / pendente / atrasado)
- Receita acumulada por hospital

### C) Tasks (Things 3-style)
- Today / Upcoming / Anytime / Someday
- Áreas (Medicina, Finanças, Pessoal, Estudos)
- Projetos (sub-tasks)
- Recorrentes
- Linked entities (tarefa "pagar fatura X" linkada à conta/cartão)

### D) Inbox / Captura
- Items pendentes vindos do Telegram que ainda não foram confirmados
- Categorização sugerida (low confidence)
- Captura web direta (campo natural-language no topo do app)
- Histórico de captura

### E) Insights / IA
- Resumo semanal/mensal gerado automaticamente
- Anomalias (gasto fora do padrão da categoria)
- Forecast de saldo (projeção 30/60/90 dias)
- Sugestões ("você tem 3 streamings, considere consolidar")
- **Carnê-leão alerts** (proximidade de teto, dedutíveis perdidos)

---

## 5. Estrutura de navegação

### Desktop (≥ 1024px)
```
┌─────────────────┬───────────────────────────────────────┐
│                 │  Top bar:                             │
│   SIDEBAR       │  [breadcrumb]  [Cmd+K]  [+ Quick Add] │
│   PERSISTENTE   ├───────────────────────────────────────┤
│   240px         │                                       │
│                 │       MAIN CONTENT                    │
│   Logo          │                                       │
│   ─────         │       (densidade comfortable)         │
│   Home          │                                       │
│   Finanças  →   │                                       │
│   Agenda    →   │                                       │
│   Tasks         │                                       │
│   Inbox  (3)    │                                       │
│   Insights      │                                       │
│   ─────         │                                       │
│   Configurações │                                       │
│   Sair          │                                       │
└─────────────────┴───────────────────────────────────────┘
```

### Mobile (< 768px)
```
┌─────────────────────────┐
│  [Bom dia, Luiz]   ⌘    │  ← top bar mínima
├─────────────────────────┤
│                         │
│      MAIN CONTENT       │
│   (densidade compact)   │
│                         │
│                         │
│              ┌────┐     │  ← FAB flutuante (+ Add)
│              │ +  │     │
│              └────┘     │
├─────────────────────────┤
│ 🏠   $   📅   ✓   ⋯    │  ← bottom nav (5 itens)
│Home Fin  Cal  Tk  Mais │
└─────────────────────────┘
```

### Command Palette (Cmd+K / Ctrl+K)
Abre modal central (desktop) ou sheet from bottom (mobile) com:
- Busca universal (transactions, shifts, tasks, categorias)
- Ações rápidas ("+ transação", "+ plantão", "+ task", "ir para finanças")
- Atalhos recentes
- Comandos AI ("mostre meus gastos com restaurantes este mês")

### Quick Add (botão "+" no top bar / FAB no mobile)
Abre modal central com **single input em linguagem natural** (mesma pipeline do Telegram):
- Placeholder: "Gastei 150 no restaurante ontem… ou plantão segunda 7-19h Einstein"
- Preview live conforme digita (intent detectado, valor parseado, categoria sugerida)
- Botões: Confirmar / Editar / Cancelar
- Atalho: tecla "N" abre direto

---

## 6. Dashboard principal (HOME / hub)

Layout em **blocos modulares**, cada bloco é um card-section. Ordem default (rearranjável pelo usuário no futuro):

### Linha 1 — Saudação + métricas primárias (sempre visível)
```
Bom dia, Luiz · maio 2026
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ SALDO TOTAL  │ MÊS ATUAL    │ PRÓX. PLANTÃO│ A RECEBER    │
│ R$ 12.430,50 │ +R$ 8.200    │ Hoje 19h     │ R$ 3.400     │
│              │ −R$ 4.150    │ Einstein     │ 2 plantões   │
│ ↑ 12% mês    │ ═ R$ 4.050   │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┘
                                                              [→ todos]
```
- Tabular nums, cores funcionais (verde/vermelho).
- Mobile: stack vertical em 2x2 grid em telas médias, 1 coluna em pequenas.

### Linha 2 — Faturas e bills urgentes
```
PRÓXIMOS VENCIMENTOS · 5 itens
┌────────────────────────────────────────────┐
│ Fatura Nubank      R$ 2.340  · vence em 3d │
│ Plano de saúde     R$   780  · vence em 5d │
│ Spotify Family     R$    35  · vence em 8d │
│ Condomínio         R$ 1.200  · vence em 12d│
│ Internet Vivo      R$   120  · vence em 15d│
└────────────────────────────────────────────┘
                                       [→ todas]
```
- Badge de cor por status: vermelho (atrasado), amber (≤ 3 dias), neutro
- Click → drill drawer com detalhes, botão "marcar pago" / "abrir boleto"

### Linha 3 — Cockpit financeiro (3 cards)

**3a. Cartão de crédito**
```
┌─────────────────────────────────┐
│ NUBANK ROXINHO                  │
│ Fatura aberta R$ 2.340 / 8.000  │
│ ████████░░░░░░  29% do limite   │
│ Fecha 28/mai · Vence 05/jun     │
│ Próx. fatura: R$ 1.890 (em curso)│
│ 3 parcelamentos ativos          │
└─────────────────────────────────┘
                        [→ detalhes]
```
- Toggle entre múltiplos cartões via tab pills no header
- Drill mostra: histórico fatura, parcelamentos abertos (compra/parcelas), limite por categoria de gasto

**3b. Top categorias do mês**
```
┌──────────────────────────────┐
│ Restaurantes  ████████ R$ 820│
│ Combustível   █████    R$ 480│
│ Mercado       ████     R$ 410│
│ Saúde         ██       R$ 220│
│ Streaming     █        R$  85│
└──────────────────────────────┘
```
- Barra horizontal CSS pura, proporcional à maior
- Click categoria → drill page com transactions filtradas

**3c. Assinaturas**
```
┌─────────────────────────────────┐
│ ASSINATURAS · R$ 187/mês        │
│ Spotify Family  R$ 35  · 12/mai │
│ Netflix Premium R$ 65  · 18/mai │
│ iCloud 200GB    R$ 12  · 22/mai │
│ Notion AI       R$ 75  · 28/mai │
└─────────────────────────────────┘
                  [+ adicionar / ver todas]
```

### Linha 4 — Agenda da semana
```
PRÓXIMOS 7 DIAS
┌──────────────────────────────────────────┐
│ HOJE      Plantão Einstein   19h → 07h   │
│           R$ 1.700 · pago após           │
│ AMANHÃ    —                              │
│ QUA       Plantão Real         7h → 19h  │
│           R$ 1.500                       │
│ QUI       —                              │
│ SEX       —                              │
│ SÁB       Consulta consultório 14h-18h   │
│ DOM       Plantão UPA          19h → 07h │
└──────────────────────────────────────────┘
                              [→ calendário]
```

### Linha 5 — Tasks / hoje
```
HOJE · 4 itens
┌──────────────────────────────────────┐
│ ☐ Pagar fatura Nubank                │
│ ☐ Estudar paper sepse (30min)        │
│ ☑ Confirmar plantão fim de semana    │
│ ☐ Lançar reembolso plano             │
└──────────────────────────────────────┘
                            [→ todas tasks]
```

### Linha 6 — Insights da IA (1-2 cards rotativos)
```
┌────────────────────────────────────────────┐
│ 💡 Você gastou 38% mais em delivery        │
│ neste mês comparado ao mesmo período de    │
│ abril. Pico foi semana 2 (R$ 320).         │
│              [ver detalhes] [dispensar]    │
└────────────────────────────────────────────┘
```
- 1-2 max. Trocam por scroll/dismiss. Nunca empilha.

### Linha 7 — Carnê-leão tracker (sazonal — destaca em fim de ano)
```
CARNÊ-LEÃO 2026 · acumulado dedutível
┌──────────────────────────────────────┐
│ Consultórios     R$  4.200           │
│ Equipamentos     R$  1.800           │
│ Congressos       R$    900           │
│ Plano de saúde   R$  6.500           │
│ ─────────────────────────            │
│ Total           R$ 13.400            │
└──────────────────────────────────────┘
                  [→ relatório · export PDF]
```

---

## 7. Sub-páginas

### `/financas` (drill financeiro)
- Tabs: **Visão geral** · Contas · Cartões · Transações · Categorias · Budgets · Goals · Bills · Assinaturas · Reembolsos · Tags · Rules · Carnê-leão
- View switcher na lista de transações: **Tabela** (default desktop) · Lista (mobile) · **Calendar** (cash flow visual) · **Gallery** (com imagens de recibo, futuro)
- Filtros laterais: período, conta, categoria, tag, type, valor min/max, status, source
- Drill-drawer (slide from right) ao clicar em transaction: detalhes + edit inline + histórico + ações
- **Splits**: botão "dividir" abre modal pra dividir o valor entre N pessoas (gera valores a receber)

### `/agenda`
- Tabs: **Calendário** · Lista · Templates · Hospitais · Pagamentos
- Calendar view: month/week/day. Cards de plantão coloridos por hospital. Drag-drop pra reagendar.
- List view: agrupados por semana, status de pagamento visível (badge "pago"/"pendente"/"atrasado")
- Drill-drawer: detalhes + edit + linked transaction de pagamento (quando recebido)

### `/tasks`
- Tabs: **Today** · Upcoming · Anytime · Someday · Logbook
- Áreas como sidebar secundária (Medicina, Finanças, Pessoal, Estudos)
- Quick-add inline (tecla "N" ou clique na linha vazia)
- Drag-drop entre listas
- Linked entities visíveis (badge "📎 Conta Nubank" se task tá linkada)

### `/inbox`
- Lista de items pendentes (vindos do Telegram que precisam confirmação manual)
- Sugestão de categoria com confidence visual (barra)
- Bulk actions: confirmar selecionados, atribuir categoria em massa
- Captura inline no topo (mesmo input do Quick Add)

### `/insights`
- Cards de insights (timeline reversa)
- Filtro por tipo: anomalias, sumário semanal, sugestões, alerts
- Cada card expande mostrando análise + dados + ação sugerida
- Dispensar / arquivar

### `/configuracoes`
- Contas, hospitais, categorias, regras
- Conexões: Telegram (status do bot), Google Calendar (autorizado/não), OFX import
- Notificações (canais, frequência)
- Export de dados (CSV, JSON)
- Tema, density, timezone

---

## 8. Mobile-first specs

### Bottom nav (5 itens fixos)
```
🏠 Home    💰 Finanças    [+]    📅 Agenda    ⋯ Mais
```
- Item central pode ser ou um destino comum (Agenda) ou um FAB elevado (+)
- "Mais" abre sheet com Tasks, Inbox, Insights, Settings, Sair

### FAB (Quick Add)
- Posição: bottom-right `bottom-20 right-4`
- Tap: abre modal Quick Add (single natural-language input + preview)
- Long press: mostra menu radial com despesas favoritas (5-6 templates)

### Gestures
- **Swipe right em transação**: confirma/marca categoria (verde)
- **Swipe left em transação**: arquivar / deletar (vermelho)
- **Pull-to-refresh**: re-fetch dados da página atual
- **Tap card**: abre drill-drawer (slide from right)
- **Long press card**: ações secundárias (compartilhar, copiar valor)

### Empty states
- Inbox vazio: "Tudo em dia ✓ Capture pelo Telegram ou no botão +"
- Agenda vazia: "Sem plantões agendados. Adicione um template ou capture pelo bot."
- Tasks vazias: "Sem tasks pra hoje. Tudo em dia."

### Widget iOS (futuro, mas projete)
- Saldo do mês + 1 número primário
- Próximo plantão
- Top 3 vencimentos próximos

### Performance mobile
- Skeleton loaders com shimmer leve em qualquer espera > 200ms
- Imagens (recibos) lazy-load com blur placeholder
- Listas infinitas com window virtualization (>100 items)

---

## 9. Componentes recorrentes

### Card padrão
- Border `zinc-800`, bg `zinc-900/50`, rounded `xl`, padding `4-5`
- Header opcional: title (`text-sm font-medium text-zinc-300`) + ação secundária link no canto
- Hover: `border-zinc-700` (sutil)

### Number display (financeiro)
- `tabular-nums font-medium`
- Negativo: `text-red-400` com prefixo `−` (minus, não hífen)
- Positivo: `text-emerald-400` com prefixo `+`
- Zero: `text-zinc-300`
- Currency: `R$` separado por espaço fino do valor

### List item (transaction-style)
```
[ícone categoria]  Descrição                      −R$ 150,00
                   2 mai · Restaurantes · Nubank
```
- Truncate com ellipsis em descrições longas
- Tap = drill drawer

### Drill drawer
- Slide-in from right (desktop) / sheet from bottom (mobile)
- Width 480px desktop, full-height mobile com handle bar
- Conteúdo: detalhes + form de edit inline + ações no footer
- Esc / swipe down fecha

### Pill tabs
- Pill rounded-full, bg `zinc-900`, active bg `zinc-100 text-zinc-900`
- Usado em filtros, switchers de view, range de tempo

### Empty state
- Ícone Lucide grande (40px) `text-zinc-700`
- Texto principal `text-sm text-zinc-400`
- Sub-texto / CTA `text-xs text-zinc-500`
- Centro vertical/horizontal

### Skeleton
- `bg-zinc-900/50` com shimmer `bg-gradient-to-r from-transparent via-zinc-800/30 to-transparent`
- Animate pulse 1.5s

### Chart simples
- **Bar horizontal:** `<div style={{width: \`${pct}%\`}} className="h-1.5 bg-{color}/60 rounded-full" />`
- **Line/Sparkline:** SVG inline simples, sem libs (usar `M` path com stroke)
- **Donut:** SVG inline com `circle` + `stroke-dasharray`
- **Sem Recharts/Chart.js no MVP.** Tudo CSS/SVG nativo.

---

## 10. Dados disponíveis no banco (use estes campos, não invente)

### `transactions`
```
id, user_id, account_id, category_id (nullable), workplace_id (nullable)
type: 'income' | 'expense' | 'transfer'
status: 'cleared' | 'pending' | 'reconciled'
amount_cents (decimal STRING, signed: − expense / + income)
currency (BRL default)
description, notes
occurred_on (date YYYY-MM-DD), cleared_on
transfer_pair_id (uuid)
source: 'manual' | 'telegram' | 'csv_import' | 'ofx_import' | 'rule'
external_id, tags (jsonb array)
auto_categorized_by, auto_confidence (0..1)
```

### `categories`
```
id, user_id, parent_id (hierárquica)
name, slug, icon (emoji ou null), color (hex ou null)
type: 'income' | 'expense' | 'transfer'
deductible_carne_leao (bool)
is_system, sort_order
```

### `financial_accounts`
```
id, user_id, name, type (checking | credit_card | savings | …)
institution, currency
initial_balance_cents (decimal)
color, is_archived, metadata
```

### `shifts`
```
id, user_id, workplace_id, template_id
title, starts_at (timestamptz), ends_at (timestamptz)
status: 'scheduled' | 'completed' | 'cancelled'
pay_cents (nullable decimal)
gcal_event_id, gcal_calendar_id, gcal_etag
```

### `workplaces`
```
id, user_id, name, short_name, address, city, state
color, default_hourly_rate_cents, default_shift_pay_cents
```

### `shift_templates`
```
id, user_id, workplace_id, recurrence_id
name, start_time_local (HH:mm), duration_minutes
pay_cents, is_active
```

### `tasks` (assumir schema típico)
```
id, user_id, area, project_id, title, notes
status: 'pending' | 'completed' | 'archived'
priority, due_on (date), scheduled_for (date), completed_at
linked_entity_type, linked_entity_id (polimórfico — transaction, account, shift)
recurrence_id, tags
```

### `inbox_items`
```
id, user_id, source (telegram | web), raw_text
parsed_intent (jsonb), suggested_category_id, confidence
status: 'pending' | 'confirmed' | 'discarded'
```

### Schemas a CRIAR (para os novos features)
- `subscriptions`: id, name, amount_cents, billing_cycle (monthly/yearly), next_charge_on, account_id, category_id, status (active/cancelled), detected_at, vendor_logo_url
- `bills`: id, name, amount_cents, due_on, account_id (pra pagar), status (pending/paid/overdue), recurrence_id (opcional), barcode, gateway_url, paid_transaction_id
- `expense_templates` (despesas favoritas): id, name, default_amount_cents, default_category_id, default_account_id, default_description, icon, sort_order
- `splits`: id, source_transaction_id, total_amount_cents, splits_jsonb [{name, amount_cents, status: pending/received}]
- `reimbursements`: id, name, amount_cents, payer (paciente/hospital/plano), status (pending/received/cancelled), due_on, received_transaction_id
- `pix_favorites`: id, key (cpf/email/phone/random), label, last_used_at

---

## 11. Interações & atalhos

### Atalhos de teclado (desktop)
| Atalho | Ação |
|---|---|
| `Cmd/Ctrl + K` | Command palette |
| `N` | Quick Add |
| `G H` | Go Home |
| `G F` | Go Finanças |
| `G A` | Go Agenda |
| `G T` | Go Tasks |
| `G I` | Go Inbox |
| `Cmd + /` | Toggle sidebar |
| `?` | Mostrar todos os atalhos |
| `Esc` | Fechar drawer/modal |

### Drill-drowns
- Toda métrica é clicável
- Saldo total → /financas
- "+8.200" no card mês → filtro income desse mês
- Card categoria → /financas com filtro daquela categoria + período
- Próximo plantão → drawer do plantão

### View switcher
Disponível em tudo que é coleção. Pílulas no top:
`Tabela · Lista · Calendar · Kanban · Gallery`
Persiste preferência por entidade no localStorage.

### Filtros persistentes
- Período (Este mês / Mês passado / Últimos 30d / Custom)
- Salvos como "Visões" nomeadas (tipo Notion)

---

## 12. O que entregar

### Mockups high-fidelity (HTML+Tailwind ou React+Tailwind)

**Desktop (≥1280px), prioridade:**
1. `/` Home (dashboard hub completo conforme seção 6)
2. `/financas` aba Transações (tabela densa + filtros + drill drawer aberto numa transação)
3. `/financas` aba Cartões (visão de fatura aberta + parcelamentos)
4. `/agenda` calendar view (mês com plantões coloridos)

**Mobile (375px iPhone), prioridade:**
1. Home (versão compact com bottom nav e FAB)
2. Finanças → Transações (lista com swipe gestures visíveis)
3. Quick Add modal (input natural + preview live)
4. Drill drawer aberto (sheet from bottom com transaction details)
5. Inbox (items pendentes com sugestão de categoria)

### Design tokens (entregar como JSON ou CSS vars)
- Cores (semantic: surface/border/text + functional)
- Tipografia (sizes, weights, line-heights)
- Spacing scale
- Border radius scale
- Shadow scale (sutil, max 2-3 níveis)
- Motion (durations, easings)

### Componentes-chave codificados (priorizar)
- `Card`, `CardHeader`, `CardSection`
- `MoneyDisplay` (com sinal, tabular nums, cor automática)
- `ListItem` (transaction-style com swipe gestures hooks)
- `DrillDrawer`
- `PillTabs`, `Tabs`
- `EmptyState`, `Skeleton`
- `BottomNav` (mobile)
- `Sidebar` (desktop)
- `CommandPalette`
- `QuickAddModal`
- `BarChartHorizontal` (CSS)
- `Sparkline` (SVG inline)
- `Donut` (SVG inline)

### Stack técnica esperada
- React (Server Components onde fizer sentido; Client onde houver interação)
- Tailwind v4
- Lucide React (ícones)
- Framer Motion (animações)
- `@radix-ui` apenas pra Dialog/Drawer/Popover/Tabs primitives (sem shadcn — composições próprias)
- **Não use:** Recharts/Chart.js, MUI, Ant Design, daisyUI

### Não entregar (escopo fora)
- Lógica de fetch/mutations (vou plugar com Drizzle direto)
- Auth flows (já existem)
- Backend
- PWA manifest

---

## 13. Critérios de qualidade

A entrega é "pronta" quando:

- [ ] Funciona lindamente em iPhone 13 (375×812) e MacBook 14" (1512×982)
- [ ] **Densidade Firefly** (muita informação visível) **+ polish Copilot** (cada pixel cuidado) **+ modularidade Notion** (blocos rearranjáveis e multiple views)
- [ ] Tabular nums em todo número monetário, sempre com `R$` e separadores BR (1.234,56)
- [ ] Datas em pt-BR (`2 mai`, `28/mai`, "Hoje", "Amanhã")
- [ ] Zero emojis decorativos no chrome (só nos dados onde vier do banco)
- [ ] Dark mode é primário, light mode é alternativo equally polished
- [ ] Transições 150-250ms ease-out, nunca > 300ms
- [ ] Sem libs de chart — tudo CSS/SVG inline
- [ ] Cada card tem hover state, focus visible, loading state, empty state
- [ ] Acessibilidade: contraste AA mínimo, focus rings, aria-labels, navegação 100% via teclado
- [ ] Mobile gestures (swipe, pull-to-refresh) com haptic + visual feedback

---

## 14. Anti-patterns explícitos (não faça)

- ❌ Cards com gradiente colorido berrante de fundo
- ❌ Glassmorphism / blur de fundo (não combina com a vibe)
- ❌ Ícones decorativos (✨🎉💸) no chrome da UI
- ❌ Barras de progresso com cor neon
- ❌ Toast notifications barulhentas
- ❌ Hover states com float/scale dramático
- ❌ Animações de entrada cascata (cada item entra delay) — distrai
- ❌ Mais de 2 fontes de família
- ❌ Mais de 5 cores funcionais simultâneas
- ❌ "Cards 3D"
- ❌ Logo grande e vibrante no header — Agendario é wordmark sutil
- ❌ Inventar campos de banco que não estão na seção 10

---

## 15. Inspirações canônicas (consulte se em dúvida)

- **Copilot Money** (iOS app) — polish, animações, native feel
- **Firefly III demo** (firefly-iii.org) — densidade financeira, drill-downs
- **Notion** — blocos modulares, multiple views, command palette
- **Linear** — atalhos teclado, dark mode perfeito, tipografia
- **Things 3** — tasks UX gold-standard
- **Cron / Notion Calendar** — agenda mobile-first elegante
- **Stripe Dashboard** — listas densas + filtros + drill drawers
- **Apple Health** — cards primários grandes, gráficos legíveis

---

**Pronto para projetar.** Comece pela `/` Home desktop (item 1 de §12), depois mobile da mesma página, depois drill em uma transação. Antes de produzir, leia este brief 2× e refencie esta seção sempre que duvidar.
