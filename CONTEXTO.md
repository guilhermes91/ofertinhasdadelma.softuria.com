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

- `main` limpa. Site no ar. SSR + admin + captação funcionando.
- Últimos commits: limitar "Em alta"/Categorias ao top 5; ajustes de espaçamento da tagstrip.
- `tagCounts(...).slice(0,5)` no header; paginação 12/página.

---

## 6. Decisões em aberto / em andamento

### 6.1 Tirar o foco excessivo de Guarujá-SP  *(pedido em 2026-05-28 — aguardando direção)*

O foco em Guarujá está cravado em ~16 pontos. **Mapa exato:**

| Arquivo | Onde |
|---------|------|
| `functions/_lib/render.js` | `SITE.city = "Guarujá-SP"` + `SITE.description` |
| `functions/index.js` | title, meta description, `<h1>` hero, `<h2>` "Uma vizinha de Guarujá..." |
| `functions/oferta/[slug].js` | seoTitle/desc fallback, `areaServed` (schema City Guarujá), lista de bairros, "Mais ofertinhas pra Guarujá" |
| `functions/tag/[slug].js` | name, `<h1>`, sub, title, description |
| `functions/_lib/scraper.js` | **prompt do Gemini OBRIGA "Guarujá" no seoTitle/seoDescription** — toda oferta nova nasce amarrada |
| `functions/api/seed.js` | seoTitle/description dos itens-semente |
| `admin/index.html` | textos de ajuda |
| `README.md` | descrição |

**Débito técnico real:** muitos textos estão hardcoded inline, **sem usar** `SITE.city`. O passo
robusto (independente do destino) é **centralizar a geo numa única config** e fazer todo SSR +
o prompt do Gemini lerem dela.

**Tensão (devil SEO Local):** Guarujá não é defeito, é o *moat* — SEO local = baixa concorrência,
dá pra cravar #1. Ir "nacional" = competir com Magalu/afiliados/ML e virar invisível. Ampliar
deve ser decisão consciente.

**Direções possíveis (a escolher):**
- **Regional — Baixada Santista:** amplia Guarujá → região (Santos, S. Vicente, Praia Grande...). Mantém moat local, raio maior. *(recomendação do par SEO)*
- **Nacional — Brasil todo:** remove geo. Máximo alcance, perde moat.
- **Configurável / sem cidade fixa:** geo vira 1 variável de config, neutra por padrão; clonável p/ outras cidades.
- **Só suavizar textos:** mantém Guarujá, reduz saturação.

> **STATUS:** aguardando o dono escolher a direção antes de codar. (Ver §2: razão antes de ação.)

---

## 7. Memória persistente do Claude

Fatos também salvos em `~/.claude/projects/<este-projeto>/memory/`:
`working-philosophy`, `team-model`, `project-ofertinhas-overview`, `origem-do-projeto`.
Este `CONTEXTO.md` é a fonte versionada no repo; a memória é o atalho por sessão.
