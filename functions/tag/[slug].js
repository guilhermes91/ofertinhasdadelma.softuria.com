import {
  loadPublicOffers,
  offersByTag,
  paginate,
  sortByDateDesc,
  humanizeTag,
  escapeHtml,
  slugify
} from "../_lib/data.js";
import { layout, offerCard, pagination, htmlResponse, notFound, SITE } from "../_lib/render.js";

export async function onRequestGet(context) {
  const { params, request, env } = context;
  const url = new URL(request.url);
  const slug = slugify(params.slug);
  const page = parseInt(url.searchParams.get("page") || "1", 10) || 1;

  const all = await loadPublicOffers(env);
  const filtered = sortByDateDesc(offersByTag(all, slug));
  if (!filtered.length) return notFound("Categoria sem ofertas no momento.", all);

  const view = paginate(filtered, page, 12);
  const label = humanizeTag(slug);

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Ofertas em ${label}`,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: view.items.map((o, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${SITE.origin}/oferta/${o.slug}/`,
      name: o.title
    }))
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Início", item: SITE.origin + "/" },
      { "@type": "ListItem", position: 2, name: label, item: `${SITE.origin}/tag/${slug}/` }
    ]
  };

  const body = `
    <section class="hero hero--compact">
      <div class="container hero__inner">
        <p class="hero__eyebrow"><span class="dot" aria-hidden="true"></span> Categoria</p>
        <h1 class="hero__title">${escapeHtml(label)} <span class="hl">em oferta</span></h1>
        <p class="hero__sub">
          ${filtered.length} ${filtered.length === 1 ? "achadinho" : "achadinhos"} de
          <strong>${escapeHtml(label.toLowerCase())}</strong> selecionados a dedo no Mercado Livre.
          Preço bom, link direto, sem enrolação.
        </p>
        <nav class="breadcrumb" aria-label="Trilha de navegação">
          <a href="/">Início</a> <span aria-hidden="true">›</span> <span>${escapeHtml(label)}</span>
        </nav>
      </div>
    </section>
    <section class="offers" aria-labelledby="tag-offers">
      <div class="container">
        <header class="section-head">
          <h2 id="tag-offers">Ofertas em ${escapeHtml(label)}</h2>
          <p>As mais novas aparecem primeiro.</p>
        </header>
        <ul class="offers__grid" role="list">${view.items.map(offerCard).join("")}</ul>
        ${pagination({ page: view.page, totalPages: view.totalPages })}
      </div>
    </section>
  `;

  const title = `${label} em oferta — achadinhos selecionados | ${SITE.name}`;
  const description = `Achadinhos de ${label.toLowerCase()} com preço bom e link direto pro Mercado Livre. Curado pela Delma.`;

  const pageUrl = (p) => (p > 1 ? `/tag/${slug}/?page=${p}` : `/tag/${slug}/`);

  return htmlResponse(
    layout({
      title,
      description,
      canonical: pageUrl(view.page),
      prev: view.page > 1 ? pageUrl(view.page - 1) : null,
      next: view.page < view.totalPages ? pageUrl(view.page + 1) : null,
      body,
      offers: all,
      jsonLd: [itemListLd, breadcrumbLd]
    })
  );
}
