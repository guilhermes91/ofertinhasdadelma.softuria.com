# CONTEXTO — Ofertinhas da Delma

> Documento mestre. Lê isto primeiro em qualquer conversa nova. Contém equipe, conceito,
> projeto, stack, estado atual e decisões em aberto. Mantido vivo: a cada mudança relevante,
> atualizar + commit + push.
>
> Última atualização: 2026-05-30.

---

## 1. Conceito

**Ofertinhas da Delma** é uma vitrine de "achadinhos" curados do Mercado Livre. O dono cola um
link de produto (meli.la), o **Gemini 2.5 Flash** faz scraping + enriquece (descrição, tags,
copy de SEO) e a oferta entra na vitrine pública. Persona: a "Delma", uma vizinha que garimpa
preço bom e indica com carinho. Tom: humano, simples, direto, sem soar robô.

Modelo de receita: links de afiliado do Mercado Livre (disclosure no rodapé).

**Origem:** nasceu em 06/05/2026 noutro path (`softuria.com/sites/ofertinhasdadelma`),
da mesma filosofia de trabalho descrita abaixo. Começou como landpage com SEO local de
Guarujá-SP e evoluiu pro CRUD/vitrine atual.

---

## 2. Filosofia de trabalho (inegociável)

- **Razão sempre vence.** Sem alucinação. Não afirmar o que não foi verificado.
- **Pares de especialistas, sempre 1 advogado do diabo ("devil").** Decisão técnica relevante
  passa por maker + cético que tenta refutar **antes** de commitar.
- **Sem bugs futuros, sem voltas mirabolantes.** Precisão cirúrgica.
- **Simples que funciona:** simples, objetivo, claro e robusto.
- **Robusto com propósito:** dimensionar a solução ao problema.
  *"Não adianta projetar uma Ferrari se um Uno nos atende perfeitamente."* Não super-engenheirar.
- **Reportar fielmente:** se não testei, digo que não testei. Se falhou, mostro a saída.

---

## 3. Equipe (software house enxuta)

Claude atua como **tech lead / orquestrador**: decide, define escopo, arbitra e só commita o
que passou no crivo. Especialistas acionados **sob demanda** (não todos rodando à toa).
Cada par = 1 maker + 1 advogado do diabo.

| Par | Maker | Advogado do diabo (devil) | Aciono quando |
|-----|-------|---------------------------|----------------|
| **Infra/Cloud** | Especialista **Cloudflare** (Pages, Workers/Functions, KV, R2, D1, cache, limites edge) | Especialista **AWS** (lock-in, custo em escala, S3/Lambda/DynamoDB/SES só quando justifica — *no banco até AWS ser relevante*) | Infra, plataforma, "Cloudflare vs AWS" |
| **Edge/Backend** | Functions, KV, scrape, Gemini, cache | Race conditions, KV eventual consistency, custo/limite Gemini, falha de scrape | Mudança em `functions/` |
| **Front/SSR** | HTML/CSS/JS, render, performance, responsivo | Regressão visual, CLS/LCP, edge cases de dados vazios | SSR, `styles.css`, `client.js`, admin |
| **SEO/Conversão** | SEO local, schema, sitemap, copy que vende | Canonical/duplicado, dado falso na vitrine, over-promise | SEO / conteúdo |
| **Segurança/Deploy** | Basic Auth, secrets, headers, GH Actions | Vazamento de secret, auth bypass, deploy quebrado | Auth, deploy, `_headers` |

**Regra firme:** o especialista AWS **não empurra AWS** num projeto que o KV do Cloudflare
resolve. Ele entra pra refutar e dimensionar.

**Protocolo (mudança não-trivial):**
1. **Definir** — fixar o problema e o tamanho (Uno vs. Ferrari).
2. **Propor** — maker propõe a solução mínima que resolve.
3. **Refutar** — devil tenta quebrar: bug futuro, edge case, regressão, custo.
4. **Decidir** — razão vence; commita só o que sobreviveu.
5. **Verificar** — reportar fielmente o testado/não-testado.

Mudança trivial (1 linha de CSS, texto) pula a cerimônia.

### 3.1 Níveis de cerimônia (Solo · Par · War Room)

Dimensiona a discussão ao risco (Uno vs. Ferrari):

| Nível | Quando | Como |
|------|--------|------|
| **Solo** | trivial (CSS, texto, 1 linha) | maker decide e faz. Sem cerimônia. |
| **Par** *(default)* | mudança relevante de código | maker propõe → devil do domínio **refuta inline** (1 rodada, narrado) → razão decide → commita o que sobrou. |
| **War Room** | gatilho abaixo, ou o dono pedir "war room"/"brainstorm" | convoca os especialistas como **sub-agentes REAIS e independentes** (contexto próprio, discordam de verdade — não é monólogo) → cada um refuta/propõe → síntese → decisão narrada. |

**Gatilhos de War Room — o Claude convoca sozinho, não espera o dono:**
- Arquitetura ou troca de stack.
- Mexe em **dinheiro/afiliado**, **segurança/secrets**, **infra/DNS/WAF** ou algo **irreversível**.
- Empate técnico no nível Par, ou o devil achou um buraco real.

**Ritual War Room (5 passos):**
1. **Definir** — problema + tamanho + critério de sucesso em 1 frase.
2. **Convocar** — escolher os pares do §3 que importam; subir 1 sub-agente real por perspectiva.
3. **Refutar** — cada devil tenta QUEBRAR a proposta (bug futuro, custo, vazamento, regressão); adversarial de verdade.
4. **Sintetizar** — o tech lead pesa, descarta o que caiu, junta o que sobrou.
5. **Decidir + Verificar** — commita só o que passou; reporta fielmente o testado/não-testado.

**Regra de ouro:** mudança pesada de infra/segurança **nunca** passa em Solo nem em monólogo —
é onde o crivo a 4 olhos mais vale. *(Gotcha real já registrado: o devil virou monólogo
justamente aí, nas mudanças de Bot Fight Mode / token / DNS.)*

---

## 4. Stack & arquitetura

- **Cloudflare Pages** (estático + Functions no edge). **Sem build step** — HTML/CSS/JS puro.
- **Workers KV** (`OFFERS_KV`) — catálogo inteiro numa única chave `offers:all` (array JSON).
- **Gemini 2.5 Flash** (free tier) — enriquece cada oferta no scrape.
- **Deploy:** auto via GitHub Actions a cada push na `main` (`.github/workflows/deploy.yml`).
  Manual: `npx wrangler pages deploy . --project-name=ofertinhasdadelma --branch=main`.

### Bindings necessários (projeto Pages)
- `OFFERS_KV` (KV namespace)
- `ADMIN_USER` (texto) · `ADMIN_PASS` (secret) · `GEMINI_API_KEY` (secret)

### Secrets do GitHub Actions
- `CLOUDFLARE_API_TOKEN` (Pages, KV, DNS edit) · `CLOUDFLARE_ACCOUNT_ID`

### Estrutura
```
.
├── _headers, _routes.json, robots.txt
├── styles.css, client.js, favicon.svg, logo-mark.svg, og-cover.svg
├── admin/                 painel (index.html + admin.js), Basic Auth
└── functions/
    ├── _middleware.js     Basic Auth p/ /admin + /api/scrape + escritas (GET/HEAD/OPTIONS livres; /captar é público de propósito)
    ├── _lib/
    │   ├── data.js        storage KV + helpers (slugify, paginate, search, tagCounts, brl, escapeHtml, safeUrl, isMercadoLivreUrl)
    │   ├── render.js      SITE config + layout/header/footer/offerCard/pagination (SSR)
    │   ├── auth.js        checkBasicAuth / unauthorized
    │   └── scraper.js     scrape ML + prompt Gemini
    ├── index.js           SSR home (busca + paginação 12/pág + grid)
    ├── tag/[slug].js      SSR tag landing
    ├── oferta/[slug].js   SSR detalhe (com JSON-LD Product/Offer)
    ├── captar.js          captação pública (?url=...)
    ├── sitemap.xml.js     sitemap dinâmico
    └── api/
        ├── offers/index.js, offers/[id].js   CRUD JSON
        ├── scrape.js      scrape + enrich Gemini
        └── seed.js        seed inicial
```

### Modelo de dado da oferta (de `ensureOffer` em `data.js`)
`id, slug, addedAt, title, description, seoTitle, seoDescription, image, imageAlt,`
`priceCurrent, priceOld, discount, link, tags[] (máx 5), bestseller, isNew, seller`.

### URLs
- Produção: <https://ofertinhasdadelma.softuria.com>
- Admin: `/admin/` (Basic Auth)
- Captação pública: `/captar?url=https://meli.la/SEUCODIGO`

---

## 5. Estado atual (2026-05-30)

- `main` no ar. SSR + admin + captação funcionando. Auto-deploy a cada push.
- **WS1 ✅ de-geo nacional** (`SITE.region`, default Brasil) — commit `51791c9`.
- **WS3 ✅ bot** (Promotop → ML, harness validou 10/10) — commit `03aa110`. Cron `*/10` em `bot.yml`.
  **2026-05-30: cron estava bloqueado pelo Bot Fight Mode do Cloudflare** (403 managed challenge no
  request do GitHub Actions, indep. de UA no IP de datacenter; e `curl -fsS | tee` mascarava como
  "verde"). **RESOLVIDO via API** (`bot_management {fight_mode:false, crawler_protection:disabled}`
  na zona softuria.com, free) + `bot.yml` agora falha visível. **Validado:** `/api/bot` do GHA →
  HTTP 200, 3 ofertas novas com nosso link. Workflow auxiliar `cf-bot-unblock.yml` (manual).
  **🔴 Segurança:** BFM ficou OFF na zona toda; rotacionar `CLOUDFLARE_API_TOKEN` (vazou, perm. ampla)
  e considerar remover `cf-bot-unblock.yml`. Detalhe na memória `estado-e-gotchas`.
- **WS2 ✅ SEO on-page** (Organization/FAQPage/Product schema, sitemap c/ imagens, relacionadas
  por tag, FAQ) — commit `a38033c`. Redesign visual fino **pendente** (precisa dos olhos do dono).
- Plano off-site + TODOs + como armar o bot: **`docs/SEO-PLAYBOOK.md`**.

### Próximos passos / open loops
1. ✅ **War Room Segurança+Infra RODOU (2026-05-30)** — §3.1 de verdade, 3 sub-agentes reais e
   independentes (Segurança/Deploy maker · Red-team devil · Infra Cloudflare×AWS). Síntese e
   **checklist de ações do dono** em §6.6.0. Parte autônoma (código) **FEITA**. **🔴 Resta o dono:**
   rotacionar `CLOUDFLARE_API_TOKEN` (2 tokens, escopo mínimo), purgar a sessão ML do KV + trocar
   senha ML, decidir BFM (deixar OFF documentado vs Cron Trigger), fechar a porta 8000 da EC2.
2. ✅ **Limpeza "Monitor Philips":** **NADA a remover** — verificado em produção (2026-05-30): é
   captura legítima (R$ 389,90, imagem, `mlId`), e o `meli.la` resolve pra **nossa tag** `sade9179546`.
   Bônus: **42/42 ofertas com nosso link, 0 sem comissão** (catálogo 100% monetizado agora).
3. ✅ **Tags/badges/cupom (War Room 2026-05-30, §6.9):** badge falso-positivo corrigido, cascata de
   badges, tags híbridas + guard anti-thin, cupom (campo+UI). **No ar.**
4. ✅ **Fonte Pelando `/recentes`** integrada e provada (§6.9.1). ⏸️ **Promobit** = próxima peça (multi-hop + cupom digitável).
5. 🔴 **EC2 on-demand (§6.9):** código do fluxo A+D pronto; **bloqueado por setup do dono** (OIDC
   GitHub→AWS, IAM mínima, fechar porta 8000). Não-negociável: OIDC, não access key (repo público).
6. **OG image raster** (1200×630) — SVG não renderiza no WhatsApp (canal principal). Ver playbook §2.
7. **Search Console + GA4** — medir e indexar. Ver playbook §2.
8. **Redesign visual** do que ficou "confuso" — rodada com prints.
9. **Backlink/Digital PR** — execução humana. Ver playbook §4.

---

## 6. Decisões tomadas / em andamento

### 6.6.0 War Room Segurança+Infra  ✅ RODOU (2026-05-30)

Convocado de verdade (§3.1): **3 sub-agentes reais e independentes** — Segurança/Deploy (maker),
Red-team (devil), Infra Cloudflare×AWS (par adversarial). O atrito achou o que o monólogo perdeu.

**Veredito (impacto decrescente):**
1. 🔴 **`CLOUDFLARE_API_TOKEN` é o ÚNICO incêndio de horas.** Vazou em transcript; escopo
   amplíssimo (WAF/DNS/Bot Mgmt/**Pages env vars**) na zona `softuria.com` inteira. Pior caso real:
   DNS hijack de qualquer subdomínio, sobrescrever env vars do Pages (sequestrar `AFFILIATE_API_URL`
   → roubar a monetização; ou apagar `GEMINI_API_KEY`/`BOT_TOKEN`). **Cura:** 2 tokens —
   deploy mínimo (Pages:Edit + Account:Read) no GitHub Secret, e um token de operador **fora do repo**
   pras ações WAF/DNS/BFM. Rotação com downtime zero: cria novo → troca secret → deploy de teste →
   **só então revoga o antigo**.
2. 🔴 **Sessão ML vazada (furo NOVO do red-team).** O cookie do painel de afiliados ML está no KV
   (`ml:session`) e vazou em transcript = secret de conta real. **Cura:** trocar senha ML + invalidar
   sessões + `OFFERS_KV.delete("ml:session")`. (A proposta original ignorava isto.)
3. **BFM é armadilha no Free.** Os 3 confirmaram: a skip-rule **NÃO** desarma o Bot Fight Mode no
   plano Free (é teatro); re-ligar BFM **requebra o cron** do bot. Opções reais: (a) deixar **OFF**
   documentado como dívida (blast radius baixo — BFM Free é filtro fraco, o ativo está atrás de
   `BOT_TOKEN`); ou (b) **portar o bot pra Cron Trigger de Worker** (roda dentro do edge, não passa
   pelo BFM) → aí BFM volta a ligar. Decisão de arquitetura/dono.
4. **EC2/monetização:** portar a geração pro edge é **inviável** (a API usa sessão ML/Playwright,
   Workers não rodam browser) — convergência Cloudflare×AWS. O ROI real **não** é trocar a EC2, é
   instrumentar a **perda silenciosa de comissão** (alarme via `/api/relink?list=1`, que já calcula
   o número). Migrar EC2→Lambda on-demand é "fase 2" (devil AWS), só se quiser relink 100% automático.
5. **`cf-bot-unblock.yml` público:** **divergência registrada.** Red-team venceu — remover é
   teatro enquanto o token vive, e perde a ferramenta de diagnóstico. **Decisão: MANTER**; restringir
   (mover ações destrutivas pra fora do repo) só **depois** da rotação do token.

**Feito nesta sessão (autônomo, código/repo, reversível):**
- IP cru da EC2 (`...:8000`) **removido** de `relink.yml` (agora secret `AFFILIATE_API_BASE`) e do
  `CONTEXTO.md` — fechava o furo que anulava o esforço de tirar o hostname do repo público.
- Token gate de `/api/bot` e `/api/relink` agora **constant-time** (reusa `constantTimeEquals` de
  `auth.js`) — higiene, consistente com o Basic Auth.
- Verificado em produção: **42/42 ofertas monetizadas**, "Monitor Philips" é legítima (nossa tag).

**🔴 CHECKLIST DO DONO (não-autônomo — dinheiro/identidade/irreversível):**
- [ ] **Rotacionar `CLOUDFLARE_API_TOKEN`** (2 tokens, escopo mínimo; revogar o antigo só após validar).
- [ ] **Trocar senha da conta de afiliado ML** + invalidar sessões; depois purgar `ml:session` do KV.
- [ ] **Decidir BFM:** deixar OFF (documentar dívida) **ou** aprovar portar o bot pra Cron Trigger.
- [ ] **Fechar a porta 8000 da EC2** no security group (IP já é público no histórico git — esconder
      não basta; o durável é o SG) e **configurar o secret `AFFILIATE_API_BASE`** no GitHub.
- [ ] (Opcional) Aprovar alarme de comissão (`/api/relink?list=1`) e/ou migração EC2→Lambda.


### 6.1 De-geo → nacional  ✅ FEITO (2026-05-28)

**Decisão (dono):** site geo-neutro/nacional. A geo de Guarujá saiu de ~16 pontos e foi
**centralizada numa única config** — `SITE.region` em `functions/_lib/render.js`
(default `"todo o Brasil"`). **Trocar esse 1 campo por uma cidade/UF (ex.: `"Guarujá-SP"`)
reativa a copy/SEO em modo local** sem tocar em mais nenhum arquivo. O prompt do Gemini
(`scraper.js`) agora lê `SITE.region` e **não obriga mais cidade nenhuma** — a amarra que
prendia toda oferta nova a "Guarujá" foi removida.

Arquivos tocados: `render.js` (config + description), `scraper.js` (prompt + fallback),
`index.js` (title/meta/hero/about), `oferta/[slug].js` (seo fallback + `areaServed`→Country BR
+ bullets), `tag/[slug].js`, `api/seed.js`, `admin/index.html`, `README.md`.

**Residual conhecido (devil):** ofertas **já gravadas no KV** mantêm `seoTitle/seoDescription`
com "Guarujá" — isso é dado, não código. Só some quando forem re-scrapeadas/editadas. Páginas
locais (`/guaruja`, etc.) ficam como porta aberta, **não construída** (seria over-engineering agora).

### 6.2 Redesign + SEO on-page  ✅ FEITO (validado com Playwright)
Referência preferida do dono: **Pechinchou** ("cópia melhorada"). Entregue:
- **Layout**: hero compacto + ofertas acima da dobra; card uniforme (loja+"há Xh" no topo,
  preço em vermelho, preço/CTA fixos no rodapé → altura idêntica, sem overflow); página de
  oferta com preço+CTA acima da dobra.
- **Feature Pechinchou — abas do feed**: `?sort=` (Recentes / Maiores descontos / Mais vendidas),
  SSR, canonical sem `sort` (sem dup content). Em `data.js` `sortOffers`.
- **Feature Pechinchou — barra WhatsApp** (canal #1): `SITE.whatsapp` em `render.js`. **Vazio =
  barra escondida.** Preencher com o link do grupo pra ativar.
- **SEO**: Organization/FAQPage/Product schema, sitemap c/ imagens, relacionadas por tag.

Não copiado de propósito (não é nosso modelo): votos/comentários (comunidade), login, chips
multi-loja (somos ML-only). Possível futuro: cards horizontais no mobile (densidade).

### 6.4 Pivô para comunidade (cópia melhorada do Pechinchou)  *(planejado)*
Decisão do dono (2026-05-28): copiar o Pechinchou de ponta a ponta + virar comunidade +
"comissionar" quem publica. Brainstorm completo e roadmap por fases em **`docs/ROADMAP-COMUNIDADE.md`**.
**🔴 Alerta jurídico (registrado):** rotação/cloaking de link de afiliado = **ban permanente** no
ML (Termos). O modelo seguro é nosso link em tudo + recompensa ao contribuidor via pontos/creator
payout (fora do trilho ML). Fase 2 (votos/comentários/contas) exige **D1 + login** (KV não basta).

### 6.8 Tempo real no /captar  ✅ FEITO (2026-05-30)
O edge alcança a API só por **hostname** (IP cru → erro 1003). Criado subdomínio DNS-only
(hash) → IP da API; `AFFILIATE_API_URL` setado como **env var do Pages** (hostname fora do repo
público; `affiliate.js` lê do env). `/captar` gera o nosso link **na hora** a partir do `sourceUrl`
(quando a EC2 está ligada). Bot **não** chama a API (relink monetiza). Gotcha: `/p/` de catálogo
não tem preço server-side → scrape do edge dá 422. Gerir subdomínio/env: `cf-bot-unblock.yml`
(`dns-add`/`dns-rm`/`set-affurl`). Detalhe na memória `estado-e-gotchas`.

### 6.7 Geração de link delegada à API externa  ✅ FEITO (2026-05-30)
Decisão do dono: a geração do link de afiliado passa a ser da API **`gerador-link-afiliados`**
(EC2 sob demanda; base da API fora do repo público — secret `AFFILIATE_API_BASE` no GitHub /
env `AFFILIATE_API_URL` no Pages). O edge **não** chama a API (porta 8000 bloqueada no
`fetch` do Workers + EC2 pode estar off → travaria); a monetização roda no **GitHub Actions**
(`relink.yml`): `/health` → `GET /api/relink?list=1` → `POST /v2/generate/batch` → `POST /api/relink
{updates}`. Edge segue gravando URL limpa (compliant). `affiliate.js` virou cliente fino
(`/v2/generate`, só ativa no edge se `AFFILIATE_API_URL` setado). **Rodar:** ligar a EC2
(`i-0f7e171903f5c4398`) → disparar `relink.yml` → desligar. Detalhe na memória `estado-e-gotchas`.

### 6.6 COMPLIANCE link de afiliado  ✅ FEITO (2026-05-30)
**Bug crítico:** link salvo era `aff || target`; com a sessão ML caída, `generateAffiliate`
retornava null e caía pro `target` = `meli.la` da FONTE (Promotop) **com a tag do concorrente**
→ creditávamos comissão a ele (proibido). **Fix:** `captar.js`/`bot.js` caem pra **URL de produto
LIMPA** (`produto.mercadolivre.com.br/MLB-<id>`, sem tag), nunca pro target. Endpoint **`/api/relink`**
(token-gated; workflow `relink.yml`) varre e corrige o que já estava gravado — rodado: 40 ofertas,
**19 links de concorrente removidos, 0 sobrando**. **🔴 Sessão ML está caída** (existe no KV mas
createLink falha) → captação nova fica sem nossa tag até o dono renovar via POST `/api/ml-session`
e rodar o relink. Detalhe na memória `estado-e-gotchas`.

### 6.5 Captação pública: aceita link direto E de afiliado  ✅ FEITO (2026-05-30)
**Problema:** dono colou no `/captar` um link `meli.la` de afiliado → oferta R$ 0,00, sem imagem e
sem afiliado. **Investigação (fatos):** link de afiliado do ML — tanto de **produto** quanto de
**perfil** — resolve server-side pra `mercadolivre.com.br/social/<tag>?ref=...`. Num link de
**produto**, o `ref` fixa o item: `og:title`/`og:image` e o **1º `MLB` do HTML** são o produto
certo, e o preço sai do card em destaque (validado: creatina 49,99 / ar-cond 1899). Num link de
**perfil**, o destaque rotaciona (daí o R$ 0,00 de um capture antigo + título/imagem trocando).
**Correção (cirúrgica):** o scraper **aceita os dois tipos** — `mlId = URL final || 1º MLB do HTML`
(pega o produto fixado pelo `ref`); só recusa link **sem nenhum `MLB`** (sem produto). `captar.js`
ganhou a guarda que o bot já tinha: sem `priceCurrent` **ou** sem `image` → 422, não publica.
Afiliado: `generateAffiliate(productUrl)` roda nos dois casos; se a sessão ML cair, cai pro link
colado (que, sendo de afiliado, já é nosso). **Validado local 4/4** (2 afiliado-produto, 1 perfil,
1 direto). **Caveat:** PDP `/p/MLB` renderiza preço client-side → fora do edge vem shell sem preço;
o ML entrega o HTML cheio pros **IPs do edge Cloudflare** (o bot prova isso rodando no edge).

### 6.3 Bot de captação automática  *(em andamento — WS3)*
Decisão (dono): **scrape de portais** (não API oficial por ora), **só Mercado Livre** (Shopee
depois), **auto-publicar** + manter captação pública por usuário. Cron a cada ~10 min.
**Fonte MVP confirmada por probe: Promotop** — `promotop.net/loja/mercado-livre` expõe ~31 links
`meli.la/...` no HTML server-side. Canaltech e Pelando renderizam no cliente (0 links server-side)
→ fase 2. **Cron ARMADO e validado (2026-05-30):** `*/10 * * * *` no `bot.yml`, rodando no ar
(HTTP 200, capturou ofertas novas). Token aceito via env `BOT_TOKEN` **ou** KV `bot:token`.
Monetização **resolvida**: a captura cai pra URL de produto limpa e a tag nossa entra via relink/API
externa (ver §6.6/§6.7). Pausar o cron = comentar o `schedule`. Histórico do bloqueio por Bot Fight
Mode e o fix estão em §5 (WS3).

### 6.9 War Room "qualidade do feed" — tags, badges, cupom, fontes, EC2  (2026-05-30)

Convocado de verdade (§3.1): 3 sub-agentes reais (SEO/Front · Edge/scrape · Infra CF×AWS), com
**evidência de fetch** (os de scrape provaram, não opinaram). Pedidos do dono nesta rodada:
melhorar tags, diversificar badges, incluir Promobit+Pelando, destacar cupom, EC2 on-demand.

**✅ FEITO nesta sessão (provado, contido, testado — smoke OK + scraper real):**
- **Badge "quase sempre mais vendido" = bug confirmado e corrigido.** O `bestseller` vinha de um
  `/MAIS VENDIDO/` sobre fatia de **8000 chars** que invadia o 2º card e a aba "Mais vendidos" do
  menu → falso-positivo. Fix: recorta só até o 2º `poly-card` e exige `poly-component__highlight>MAIS
  VENDIDO` (`scraper.js`). Validado contra HTML real (Philips → `bestseller:false`).
- **Cascata de badges** (`render.js` `pickStateBadge`): UMA marca por prioridade **Cupom > Mais
  vendido (real) > Novidade (<24h)**; senão nada. Matou o `isNew:true` perpétuo. Diversidade vinda do dado.
- **Tags híbridas (resposta à pergunta do dono: SEPARAR responsabilidades).** Os 5 papéis como
  *página* dariam thin-content (`#mercadolivre` em 100% = duplicada; `#modelo` = 1 item = soft-404).
  Decisão: `tags[]` segue plano e navegável **só com categoria/marca**; campos **derivados por
  código** `store` (sempre `mercado-livre`) e `model` (extraído do título) viram **hashtags de
  descoberta que linkam pra BUSCA**, não pra `/tag`. Na página da oferta o dono vê o cluster de 5
  hashtags (#MercadoLivre #Cupom #categoria #marca #modelo); card mantém chips de categoria. Prompt
  do Gemini enviesado p/ categoria+marca. **Guard anti-thin:** sitemap e "Em alta" só listam tag com
  **≥2 ofertas** (`tagCounts().filter(count>=2)`). Convive com as 42 ofertas antigas sem migração.
- **Cupom (não existia).** Campo `coupon{code,text,campaignId,source}` em `ensureOffer`. Selo "Cupom"
  no card + **bloco copiável** na página da oferta (`client.js` copy c/ fallback). **Honesto:** o ML
  aplica desconto por **campanha no link** (`coupon_campaign_id`), código digitável é raro → capturamos
  o `campaignId` quando existe; sem inventar código. `priceValidUntil` reduzido 14→3 dias (schema não mente preço).

### 6.9.1 Fontes Pelando + Promobit  (2026-05-30, correção)

O dono reforçou: quando ele manda fonte, é decisão tomada — validar o **fluxo**, não o "se". E
apontou as URLs certas. **Correção honesta:** na 6.9 dei "Pelando inviável" testando a HOME
(client-side) — ERRADO. A fonte é **`/recentes`**.

- **✅ PELANDO `/recentes` — INTEGRADO E PROVADO (no ar).** `/recentes` vem renderizado no servidor
  (RSC): links de saída `dpl.pelando.com.br/r/<JWT>` com a URL de destino em **base64 no payload**.
  Feed é misto (ML/Shopee/Amazon) → filtramos só ML por ora. O `dpl` redireciona pra
  `/social/pelando?ref=` (HTML cheio com preço), **igual ao meli.la** → o scraper segue o `dpl`
  (`REDIRECTOR_HOSTS` em `scraper.js`). **Provado 4/4** ponta a ponta (preço real, mlId, link salvo
  LIMPO `produto.mercadolivre.com.br/MLB-` = compliant; `sourceUrl`=dpl pro relink). Em `portals.js`
  `crawlPelando` + entrou no `discoverMlOffers`. Custo: +1 fetch (o feed); resolução do redirect é o
  mesmo fetch do scrape (sem hop extra).
- **⏸️ PROMOBIT `/promocoes/loja/mercado-livre/` — viável e RICO em cupom, próxima peça.** O
  `__NEXT_DATA__` expõe server-side: preço (`offerPrice/offerOldPrice`) e **código de cupom DIGITÁVEL**
  (`offerCoupon`, `couponCode` ex.: `MELIBELEZA`/`SOHOJE`, com `couponInstructions`/`couponUntil`) —
  o que o ML cru não dá. Mas o link ML de cada oferta exige salto `/oferta/<slug>` → `/Redirect/to/<id>`
  (interstitial com o `meli.la` no HTML). Implica **multi-hop + carregar o código do cupom** (muda o
  contrato de candidato de `string[]` p/ `{url, coupon}`). Fica como peça focada — é onde o campo
  `coupon.code` (já existente) ganha código de verdade.
- **EC2 on-demand:** caminho **A+D** — `relink.yml` liga→`wait`→`/health`→relinka→`stop` (`if:always`,
  `concurrency`), disparado pelo `bot.yml` quando `added+refreshed>0`; auto-shutdown interno como
  backstop. **🔴 Exige setup do dono:** OIDC GitHub→AWS (NÃO access key num repo público), IAM mínima
  (start/stop por ARN da `i-0f7e171903f5c4398`), fechar porta 8000 / auth na API. Código pronto pra
  entrar quando o OIDC existir.

---

## 7. Memória persistente do Claude

Fatos também salvos em `~/.claude/projects/<este-projeto>/memory/`:
`working-philosophy`, `team-model`, `project-ofertinhas-overview`, `origem-do-projeto`,
`estado-e-gotchas`. Este `CONTEXTO.md` é a fonte versionada no repo; a memória é o atalho por sessão.

---

## 8. Fluxo de TESTE / QA / validação local (NÃO versionado)

> Por decisão do dono, todo o scaffolding de teste/QA fica **fora do git** (`tools/` e `scripts/`
> no `.gitignore`) pra manter o repo limpo e deployável. Os arquivos **continuam na máquina local**
> (gitignore não apaga). Esta seção existe pra **recriar do zero** numa conversa futura se sumirem.

**O que existe (local, em `tools/` e `scripts/`):**
- `tools/shoot.mjs` — **Playwright/Chromium**. Renderiza o SSR real com KV mockado (dados
  "maldosos": título sem espaço, oferta sem imagem, descrição longa, preço enorme), serve em
  `localhost`, tira print **desktop (1366×900) e mobile (390×844)** de home/oferta e **mede**
  altura dos cards (alinhamento), posição do 1º card vs dobra e posição do CTA. Saída em `tools/shots/`.
- `tools/ref.mjs` — screenshota **referências** (Pechinchou, Promotop) desktop+mobile pra analisar
  arquitetura de informação.
- `scripts/test-bot.mjs` — valida o **bot**: descoberta (Promotop→ML) + `scrapeOffer` real, meta
  **≥10 ofertas**, roda **sem `GEMINI_API_KEY`** (usa fallback, não gasta cota).
- `scripts/smoke-render.mjs` — **smoke SSR**: renderiza home/oferta/tag/sitemap, confere schemas e
  que **não vaza "Guarujá"**.

**Como recriar / rodar (Node ≥18; aqui v24):**
```bash
# 1) Playwright (uma vez)
cd tools && npm init -y && npm i playwright && npx playwright install chromium && cd ..
# 2) Rodar
node tools/shoot.mjs        # prints + métricas de layout (lê os PNGs em tools/shots/)
node tools/ref.mjs          # prints das referências
node scripts/test-bot.mjs   # valida captação (>=10 ofertas)
node scripts/smoke-render.mjs  # smoke SSR
```
Os harnesses importam direto de `functions/_lib/*` e das páginas SSR — sem build step.
O processo de design é: **rodar shoot.mjs → abrir os PNGs → diagnosticar → corrigir CSS/SSR →
re-rodar → comparar**. Sempre validar visualmente desktop **e** mobile antes de commitar.
