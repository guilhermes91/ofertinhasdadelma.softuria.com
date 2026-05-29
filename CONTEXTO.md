# CONTEXTO — Ofertinhas da Delma

> Documento mestre. Lê isto primeiro em qualquer conversa nova. Contém equipe, conceito,
> projeto, stack, estado atual e decisões em aberto. Mantido vivo: a cada mudança relevante,
> atualizar + commit + push.
>
> Última atualização: 2026-05-28.

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

## 5. Estado atual (2026-05-28)

- `main` no ar. SSR + admin + captação funcionando. Auto-deploy a cada push.
- **WS1 ✅ de-geo nacional** (`SITE.region`, default Brasil) — commit `51791c9`.
- **WS3 ✅ bot** (Promotop → ML, cron desarmado, harness validou 10/10) — commit `03aa110`.
- **WS2 ✅ SEO on-page** (Organization/FAQPage/Product schema, sitemap c/ imagens, relacionadas
  por tag, FAQ) — commit `a38033c`. Redesign visual fino **pendente** (precisa dos olhos do dono).
- Plano off-site + TODOs + como armar o bot: **`docs/SEO-PLAYBOOK.md`**.

### Próximos passos (com o dono)
1. **Validar o bot juntos** e decidir monetização (link de afiliado nosso) → armar cron.
2. **OG image raster** (1200×630) — SVG não renderiza no WhatsApp (canal principal). Ver playbook §2.
3. **Search Console + GA4** — medir e indexar. Ver playbook §2.
4. **Redesign visual** do que ficou "confuso" — rodada com prints.
5. **Backlink/Digital PR** — execução humana. Ver playbook §4.

---

## 6. Decisões tomadas / em andamento

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

### 6.2 Redesign + SEO on-page  *(em andamento — WS2)*
Alvo: cards/badges no estilo Promotop (o que o dono curtiu) + otimização de imagem estilo
Canaltech + hierarquia/seções pra matar o "confuso" + engenharia SEO (schema, sitemap,
performance/CLS, internal linking). Referências avaliadas: Promotop (WordPress, visual forte mas
fraco técnico), Canaltech (Next.js, padrão-ouro de engenharia), Pelando (Astro, mas modelo de
comunidade — não é o nosso).

### 6.3 Bot de captação automática  *(em andamento — WS3)*
Decisão (dono): **scrape de portais** (não API oficial por ora), **só Mercado Livre** (Shopee
depois), **auto-publicar** + manter captação pública por usuário. Cron a cada ~10 min.
**Fonte MVP confirmada por probe: Promotop** — `promotop.net/loja/mercado-livre` expõe ~31 links
`meli.la/...` no HTML server-side. Canaltech e Pelando renderizam no cliente (0 links server-side)
→ fase 2. **Cron entregue DESARMADO** (manual/`workflow_dispatch`) até validação local de ≥10
ofertas reais capturadas (exigência do dono). Monetização: o link capturado credita o afiliado do
portal-fonte; trocar pelo nosso link (gerador ML / API futura) é passo separado — ver SEO-PLAYBOOK.

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
