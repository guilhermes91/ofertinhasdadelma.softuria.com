# Ofertinhas da Delma

Site de achadinhos curados do Mercado Livre, com alcance nacional. Vitrine pública + admin com geração automática de copy/tags via Gemini 2.5 Flash + URL pública de captação.

- Produção: <https://ofertinhasdadelma.softuria.com>
- Admin: <https://ofertinhasdadelma.softuria.com/admin/> (Basic Auth)
- Captação pública: <https://ofertinhasdadelma.softuria.com/captar?url=https://meli.la/SEUCODIGO>

## Stack

- Cloudflare Pages (estático + Functions no edge)
- Workers KV para o catálogo (`OFFERS_KV`, key `offers:all`)
- Gemini 2.5 Flash (free tier) para enriquecer cada oferta
- HTML/CSS/JS puro, sem build step

## Estrutura

```
.
├── _headers              cabeçalhos de cache + segurança
├── _routes.json          quais paths vão para Functions
├── styles.css            estilos do site + admin
├── client.js             JS do front (busca, scroll suave)
├── favicon.svg / logo-mark.svg / og-cover.svg
├── robots.txt
├── admin/                painel (HTML + JS), protegido por Basic Auth
└── functions/
    ├── _middleware.js    Basic Auth para /admin e write APIs
    ├── _lib/             utils compartilhados (data, render, auth, scraper)
    ├── index.js          SSR home (busca + paginação + grid)
    ├── tag/[slug].js     SSR tag landing
    ├── oferta/[slug].js  SSR detalhe da oferta
    ├── captar.js         endpoint público de captação
    ├── sitemap.xml.js    sitemap dinâmico
    └── api/
        ├── offers/       CRUD JSON
        ├── scrape.js     scrape ML + enrich Gemini
        └── seed.js       seed inicial das ofertas
```

## Deploy

Auto-deploy ativo via GitHub Actions a cada push na `main` (ver `.github/workflows/deploy.yml`).

Manual (do diretório raiz):

```bash
npx wrangler pages deploy . --project-name=ofertinhasdadelma --branch=main
```

### Bindings necessários no projeto Pages

- `OFFERS_KV` (KV namespace)
- `ADMIN_USER` (texto)
- `ADMIN_PASS` (secret)
- `GEMINI_API_KEY` (secret)

### Secrets do GitHub Actions

- `CLOUDFLARE_API_TOKEN` — token com Pages, KV, DNS edit
- `CLOUDFLARE_ACCOUNT_ID`

## Adicionar uma oferta

1. **Admin** (`/admin/`): cole o link da meli.la, clique "Buscar", revise e salve.
2. **Pública** (`/captar?url=...`): cole no navegador — a oferta entra direto.

---

Site desenvolvido por [Softuria](https://softuria.com).
