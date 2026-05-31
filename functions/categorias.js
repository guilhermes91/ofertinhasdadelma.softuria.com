import { loadOffers, tagCounts, humanizeTag, escapeHtml } from "./_lib/data.js";
import { layout, htmlResponse, SITE } from "./_lib/render.js";

// Hub de categorias: lista todas as tags com ≥2 ofertas (thin-content fica de fora).
// Dá ao Google e ao usuário um índice navegável de tudo — internal linking forte.
export async function onRequestGet(context) {
  const all = await loadOffers(context.env);
  const tags = tagCounts(all).filter((t) => t.count >= 2);

  const listHtml = tags.length
    ? `<ul class="tagcloud__list">${tags
        .map(
          (t) =>
            `<li><a href="/tag/${escapeHtml(t.slug)}/"><span>#${escapeHtml(humanizeTag(t.slug))}</span><em>${t.count}</em></a></li>`
        )
        .join("")}</ul>`
    : `<p class="offers__empty">Ainda não temos categorias com ofertas suficientes. Volte logo!</p>`;

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Categorias de achadinhos",
    itemListElement: tags.map((t, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${SITE.origin}/tag/${t.slug}/`,
      name: humanizeTag(t.slug)
    }))
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Início", item: SITE.origin + "/" },
      { "@type": "ListItem", position: 2, name: "Categorias", item: `${SITE.origin}/categorias` }
    ]
  };

  const body = `
    <section class="hero hero--compact">
      <div class="container hero__inner">
        <p class="hero__eyebrow"><span class="dot" aria-hidden="true"></span> Navegue por categoria</p>
        <h1 class="hero__title">Todas as <span class="hl">categorias</span></h1>
        <p class="hero__sub">Escolha um tipo de achadinho e veja só o que interessa. Tudo curado à mão no Mercado Livre.</p>
        <nav class="breadcrumb" aria-label="Trilha de navegação">
          <a href="/">Início</a> <span aria-hidden="true">›</span> <span>Categorias</span>
        </nav>
      </div>
    </section>
    <section class="tagcloud" aria-label="Categorias">
      <div class="container">
        ${listHtml}
      </div>
    </section>
  `;

  return htmlResponse(
    layout({
      title: `Categorias de achadinhos — ${SITE.name}`,
      description: "Navegue por categoria e ache o achadinho certo: eletrônicos, casa, moda e mais, sempre com preço bom no Mercado Livre.",
      canonical: "/categorias",
      body,
      offers: all,
      jsonLd: [itemListLd, breadcrumbLd]
    })
  );
}
