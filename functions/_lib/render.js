import { brl, escapeHtml, humanizeTag, safeUrl, tagCounts } from "./data.js";

export const SITE = {
  name: "Ofertinhas da Delma",
  tagline: "achadinhos com preço bom todo dia",
  origin: "https://ofertinhasdadelma.softuria.com",
  // Geo único e central. "todo o Brasil" = modo nacional/neutro.
  // Troque por uma cidade/UF (ex.: "Guarujá-SP") para reativar a copy e o
  // SEO em modo local sem mexer em mais nenhum arquivo.
  region: "todo o Brasil",
  description:
    "Achadinhos do Mercado Livre garimpados com carinho. Preço bom, link direto e curadoria diária, com entrega pra todo o Brasil."
};

export function htmlResponse(html, init = {}) {
  return new Response(html, {
    status: init.status || 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": init.cacheControl || "public, max-age=60, s-maxage=120, stale-while-revalidate=600",
      ...(init.headers || {})
    }
  });
}

export function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init.headers || {})
    }
  });
}

export function notFound(message = "Página não encontrada.", offers = []) {
  const body = `
    <section class="hero">
      <div class="container hero__inner" style="text-align:center;">
        <h1 class="hero__title">Ops, ${escapeHtml(message)}</h1>
        <p class="hero__sub">Volte para a página inicial e dá uma olhada no que tá rolando hoje.</p>
        <div class="hero__cta" style="justify-content:center;">
          <a class="btn btn--primary" href="/">Ver as ofertas</a>
        </div>
      </div>
    </section>
  `;
  return htmlResponse(layout({ title: "Não encontrada", description: message, body, offers, canonical: "/" }), {
    status: 404,
    cacheControl: "no-store"
  });
}

export function layout({
  title,
  description,
  body,
  offers = [],
  canonical = "/",
  ogImage,
  jsonLd = [],
  noindex = false,
  searchQuery = ""
}) {
  const safeTitle = escapeHtml(title || SITE.name);
  const safeDesc = escapeHtml(description || SITE.description);
  const url = canonical.startsWith("http") ? canonical : `${SITE.origin}${canonical}`;
  const og = ogImage || `${SITE.origin}/og-cover.svg`;
  const tags = tagCounts(offers).slice(0, 5);
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.origin + "/",
    logo: SITE.origin + "/logo-mark.svg",
    description: SITE.description
  };
  const ldBlocks = [orgLd, ...(Array.isArray(jsonLd) ? jsonLd : [jsonLd])]
    .filter(Boolean)
    .map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}" />
  <meta name="robots" content="${noindex ? "noindex,follow" : "index,follow,max-image-preview:large"}" />
  <meta name="theme-color" content="#fff5ec" />
  <meta name="author" content="Softuria" />
  <link rel="canonical" href="${escapeHtml(url)}" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/logo-mark.svg" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${escapeHtml(SITE.name)}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:url" content="${escapeHtml(url)}" />
  <meta property="og:image" content="${escapeHtml(og)}" />
  <meta property="og:image:alt" content="${safeTitle}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image" content="${escapeHtml(og)}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="preconnect" href="https://http2.mlstatic.com" crossorigin />
  <link rel="stylesheet" href="/styles.css?v=20260528a" />
  ${ldBlocks}
</head>
<body>
  <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
  ${header(searchQuery, tags)}
  <main id="conteudo">${body}</main>
  ${footer()}
  <script src="/client.js" defer></script>
</body>
</html>`;
}

export function header(searchQuery = "", topTags = []) {
  const q = escapeHtml(searchQuery || "");
  const tagsHtml = topTags
    .map(
      (t) =>
        `<a class="taglink" href="/tag/${escapeHtml(t.slug)}/">${escapeHtml(humanizeTag(t.slug))}</a>`
    )
    .join("");
  return `
    <header class="site-header" role="banner">
      <div class="container header__inner">
        <a class="brand" href="/" aria-label="Ofertinhas da Delma — página inicial">
          <span class="brand__mark" aria-hidden="true">${brandSvg()}</span>
          <span class="brand__text">
            <span class="brand__name">${escapeHtml(SITE.name)}</span>
            <span class="brand__tag">${escapeHtml(SITE.tagline)}</span>
          </span>
        </a>
        <form class="search" role="search" action="/" method="get">
          <label class="search__label" for="q">Buscar oferta</label>
          <input class="search__input" id="q" name="q" type="search" inputmode="search"
                 autocomplete="off" placeholder="O que você procura hoje?" value="${q}" />
          <button class="search__btn" type="submit" aria-label="Buscar">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M11 19a8 8 0 1 1 5.3-14.05A8 8 0 0 1 11 19zm10 2-4.3-4.3"/></svg>
          </button>
        </form>
      </div>
      ${
        tagsHtml
          ? `<div class="container tagstrip" aria-label="Categorias em destaque"><span class="tagstrip__label">Em alta:</span>${tagsHtml}</div>`
          : ""
      }
    </header>
  `;
}

export function footer() {
  const year = new Date().getFullYear();
  return `
    <footer class="site-footer" role="contentinfo">
      <div class="container site-footer__inner">
        <p class="site-footer__brand">© ${year} ${escapeHtml(SITE.name)}</p>
        <p class="site-footer__credit">
          Site desenvolvido por
          <a href="https://softuria.com" target="_blank" rel="noopener noreferrer">Softuria</a>
        </p>
        <p class="site-footer__legal">
          Os links de oferta podem ser de afiliado. O preço final e a disponibilidade são definidos pela loja parceira no momento da compra.
        </p>
      </div>
    </footer>
  `;
}

export function offerCard(offer) {
  const url = safeUrl(offer.link) || "#";
  const detail = `/oferta/${escapeHtml(offer.slug)}/`;
  const discount =
    offer.discount && offer.discount >= 5
      ? `<span class="offer-card__badge">${offer.discount}% OFF</span>`
      : "";
  const tag = offer.bestseller
    ? `<span class="offer-card__tag offer-card__tag--bestseller">Mais vendido</span>`
    : offer.isNew
    ? `<span class="offer-card__tag offer-card__tag--new">Novidade</span>`
    : "";
  const img = safeUrl(offer.image);
  const oldPrice =
    typeof offer.priceOld === "number" && offer.priceOld > offer.priceCurrent
      ? `<span class="offer-card__price-old">${escapeHtml(brl(offer.priceOld))}</span>`
      : "";
  const tagsHtml = (offer.tags || [])
    .slice(0, 3)
    .map((t) => {
      const label = humanizeTag(t);
      const display = label.length > 18 ? label.slice(0, 17) + "…" : label;
      return `<a class="offer-card__chip" href="/tag/${escapeHtml(t)}/" title="${escapeHtml(label)}">#${escapeHtml(display)}</a>`;
    })
    .join("");

  const titleSafe = escapeHtml(offer.title);
  return `
    <li class="offer-card">
      <a class="offer-card__media" href="${url}" target="_blank" rel="noopener nofollow sponsored" aria-label="Ir para a oferta: ${titleSafe}">
        ${discount}${tag}
        ${
          img
            ? `<img src="${img}" alt="${escapeHtml(offer.imageAlt || offer.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
            : `<span role="img" aria-label="${escapeHtml(offer.imageAlt || offer.title)}"></span>`
        }
      </a>
      <div class="offer-card__body">
        <h3 class="offer-card__title">
          <a href="${url}" target="_blank" rel="noopener nofollow sponsored">${titleSafe}</a>
        </h3>
        ${
          offer.description
            ? `<p class="offer-card__desc">${escapeHtml(offer.description)}</p>`
            : ""
        }
        ${tagsHtml ? `<div class="offer-card__chips" aria-label="Categorias relacionadas">${tagsHtml}</div>` : ""}
        <div class="offer-card__price">
          <span class="offer-card__price-current">${escapeHtml(brl(offer.priceCurrent || 0))}</span>
          ${oldPrice}
        </div>
        <div class="offer-card__actions">
          <a class="offer-card__cta" href="${url}" target="_blank" rel="noopener nofollow sponsored">Pegar a oferta</a>
          <a class="offer-card__detail" href="${detail}" aria-label="Ver detalhes de ${titleSafe}">Ver detalhes</a>
        </div>
      </div>
    </li>
  `;
}

export function pagination({ page, totalPages, baseQuery = "" }) {
  if (totalPages <= 1) return "";
  const q = baseQuery ? `${baseQuery}&` : "";
  const link = (n, label, current) =>
    current
      ? `<span class="page-link page-link--current" aria-current="page">${label}</span>`
      : `<a class="page-link" href="?${q}page=${n}">${label}</a>`;
  const items = [];
  if (page > 1) items.push(link(page - 1, "‹ Anterior", false));
  const window = 2;
  const start = Math.max(1, page - window);
  const end = Math.min(totalPages, page + window);
  if (start > 1) {
    items.push(link(1, "1", false));
    if (start > 2) items.push(`<span class="page-ellipsis">…</span>`);
  }
  for (let i = start; i <= end; i++) items.push(link(i, String(i), i === page));
  if (end < totalPages) {
    if (end < totalPages - 1) items.push(`<span class="page-ellipsis">…</span>`);
    items.push(link(totalPages, String(totalPages), false));
  }
  if (page < totalPages) items.push(link(page + 1, "Próxima ›", false));
  return `<nav class="pagination" aria-label="Navegação de páginas">${items.join("")}</nav>`;
}

export function brandSvg() {
  return `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" focusable="false"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff7aa2"/><stop offset="100%" stop-color="#e64a6e"/></linearGradient></defs><path d="M12 4h16a8 8 0 0 1 8 8v6c0 9.94-7.06 18-16 18S4 27.94 4 18v-6a8 8 0 0 1 8-8z" fill="url(#bg)"/><path d="M14 17.5c0-2.21 1.79-4 4-4 1.45 0 2.72.77 3.43 1.93C22.13 14.27 23.4 13.5 24.85 13.5c2.21 0 4 1.79 4 4 0 4.5-7.43 8.5-7.43 8.5S14 22 14 17.5z" fill="#fff"/></svg>`;
}
