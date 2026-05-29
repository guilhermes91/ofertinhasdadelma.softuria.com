# Roadmap — Virar comunidade (cópia melhorada do Pechinchou)

> Brainstorm da equipe sobre o pedido do dono (2026-05-28): "copiar o Pechinchou de ponta a
> ponta, melhorado, virar comunidade, e balancear/comissionar a publicação do público dividindo
> views entre o link de afiliado de quem registrou e o nosso".
> Decisão de execução: **incremental**, com razão e sem pegar ban. Ver `CONTEXTO.md`.

---

## 0. A virada (o que está em jogo)

Isto **não é layout** — é um **pivô de produto**: de *vitrine curada de afiliado* para
*plataforma de comunidade UGC* (usuários publicam, votam, comentam). Ótima direção, mas é
multi-fase e algumas partes mexem em **arquitetura** (banco, login, moderação) e em **risco
jurídico** (regras do afiliado ML). Tratamos por fases, entregando valor seguro a cada passo.

---

## 1. 🔴 O ponto crítico primeiro: o "balanceamento de afiliados"

**A ideia do dono:** quando alguém publica uma oferta com o link de afiliado **dele**, rotacionar
os cliques entre o link dele e o **nosso** (ex.: 70/30) pra comissionar o trabalho do público.

**Veredito do Jurídico/Compliance + Devil (com base nos Termos do Programa de Afiliados ML):**
> **NÃO FAÇA rotação/cloaking de link. É caminho de BAN PERMANENTE.** Os Termos do ML são explícitos:
> - Proibido encurtar/ocultar o domínio ML com terceiros (cloaking) — comissão perdida + flag.
> - **Fraude** = "emprego de recursos tecnológicos para burlar os controles e as regras de
>   divulgação" → **exclusão permanente do Programa**. Um redirect que troca/rotaciona o
>   parâmetro de afiliado é exatamente isso.
> - Não pode comprar pelo próprio link; não pode impulsionar em search/shopping ads.
> Fonte: Termos oficiais (ML Ajuda 30228).

**O objetivo do dono é legítimo** ("recompensar quem traz oferta boa"). Como fazer **sem** ban:

- **Modelo recomendado — atribuição transparente + creator payout nosso:**
  1. **Nosso link de afiliado em tudo** (um único link, visível, sem cloaking — 100% dentro das
     regras). Atribuição consistente e nossa.
  2. **Recompensar o contribuidor por fora do trilho ML:** sistema de **pontos/reputação**
     (gamificação — o lado "social" do Pechinchou) e, pros tops, **pagamento de creator via Pix/
     crédito**, saído da NOSSA comissão. É um acordo comercial nosso com o creator, **não** uma
     manipulação do link do ML. Compliant.
- **Alternativa (se o contribuidor for afiliado dele):** a oferta dele fica com o link **dele**
  (ele ganha direto do ML), as nossas (bot/curadoria) ficam com o **nosso**. Sem rotação. O
  "balanço" é natural: mais gente publicando → mais tráfego → nossas ofertas também rendem mais.

> **Decisão do dono necessária:** confirmamos o modelo compliant (nosso link + pontos/creator
> payout) e **descartamos a rotação**? (Recomendação forte da equipe: sim.)

---

## 2. Inventário do Pechinchou — copiar / adaptar / pular

| Recurso dele | Decisão | Quem / porquê |
|---|---|---|
| Cards (loja+tempo, preço destacado), abas, grid 2-col mobile, barra WhatsApp | ✅ **FEITO** | Front/SEO |
| Publicar oferta público | ✅ feito (CTA) / 🔜 enriquecer | Produto |
| Feed "Recentes / Quentes / Comentadas" | 🔜 adaptar | "Quentes" por **cliques** (sem login) na fase 1; por votos na fase 2 |
| Votos (❤/temperatura) | 🔜 Fase 2 | precisa login (anti-spam) |
| Comentários | 🔜 Fase 2 | precisa login + moderação |
| Contas de usuário / login | 🔜 Fase 2 | base de tudo "social" |
| Reputação/pontos/creator | 🔜 Fase 3 | Monetização (substitui a rotação de link) |
| "Stories" (círculos) | ⚪ opcional | enfeite; baixo valor |
| Chips multi-loja (Amazon/Magalu) | ⛔ pular | somos ML-only (por ora) |
| Cupons | ⚪ futuro | só se houver fonte confiável |

---

## 3. Arquitetura (Arquiteto de Dados + Infra Cloudflare/AWS)

Hoje: KV (1 chave com o catálogo). **KV não serve** pra usuários/votos/comentários (sem queries,
sem concorrência fina). Comunidade exige:
- **Cloudflare D1 (SQLite)** — nativo, free tier generoso, fica no edge. Tabelas: `users`,
  `offers`, `votes`, `comments`, `points`. (Migrar o catálogo de KV→D1 quando entrar a Fase 2.)
- **Login:** evitar senha própria (superfície de ataque). Preferir **OAuth Google** ou
  **magic-link por e-mail**. Sessão em cookie assinado.
- **Anti-spam/abuso:** **Cloudflare Turnstile** (captcha grátis) no publicar/cadastro, rate-limit
  (já temos padrão por IP no /captar), fila de **moderação** no admin.
- **Cliques/Quentes:** endpoint de redirect `/ir/:id` que conta clique (KV/D1) e manda pro ML —
  habilita "Quentes" por clique **sem** login e é a base de métrica do creator. (Mantém o link
  ML visível no destino — sem cloaking.)

Devil (Infra): D1 + login + moderação é trabalho de **semanas**, não de uma sessão. Fazer por
fase, cada uma testada (Playwright + smoke + harness), sem big bang.

---

## 4. Roadmap por fases (dimensionado)

- **Fase 0 — Paridade visual** ✅ FEITO: cards, abas, 2-col mobile, barra WhatsApp, CTA publicar.
- **Fase 1 — Comunidade-lite (sem login, rápido, baixo risco):**
  - Captação pública enriquecida: apelido opcional de quem envia → "enviado por @fulano" no card
    (crédito social sem conta).
  - Redirect `/ir/:id` com contagem de clique → aba **"Quentes"** por cliques.
  - WhatsApp real (trocar `#placeholder`).
- **Fase 2 — Contas + votos + comentários (pesado):** D1 + OAuth/magic-link + Turnstile +
  moderação. Migrar catálogo p/ D1.
- **Fase 3 — Monetização/creator:** nosso link em tudo + pontos/reputação + payout de creator via
  Pix (fora do ML). **Nunca** rotação/cloaking.

---

## 5. Decisões que travam o avanço (precisam do dono)

1. **Afiliado:** confirmar modelo compliant (nosso link + creator payout por pontos) e descartar a
   rotação de link? *(recomendação forte: sim)*
2. **Login (Fase 2):** Google OAuth, magic-link por e-mail, ou os dois?
3. **Sequência/escopo:** topa o caminho incremental (Fase 1 já, Fase 2/3 planejadas) ou quer
   priorizar algo específico antes?
4. **Migração KV→D1:** ok migrar o catálogo pro D1 quando a Fase 2 começar?
