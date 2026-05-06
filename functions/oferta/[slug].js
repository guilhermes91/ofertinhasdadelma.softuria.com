import {
  loadOffers,
  sortByDateDesc,
  escapeHtml,
  brl,
  safeUrl,
  humanizeTag
} from "../_lib/data.js";
import { layout, htmlResponse, notFound, offerCard, SITE } from "../_lib/render.js";

export async function onRequestGet(context) {
  const { params, env } = context;
  const slug = String(params.slug || "").trim();

  const all = await loadOffers(env);
  const offer = all.find((o) => o.slug === slug);
  if (!offer) return notFound("Essa oferta saiu do ar.", all);

  const others = sortByDateDesc(all.filter((o) => o.id !== offer.id)).slice(0, 3);
  const link = safeUrl(offer.link) || "#";
  const seoTitle = offer.seoTitle || `${offer.title} em Guarujá-SP — ${SITE.name}`;
  const seoDescription =
    offer.seoDescription ||
    `${offer.title} com preço bom e entrega rápida pra Guarujá-SP e região. Veja antes que acabe.`;

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: offer.title,
    description: offer.description || offer.title,
    image: offer.image || undefined,
    sku: offer.id,
    brand: { "@type": "Brand", name: offer.seller || "Mercado Livre" },
    offers: {
      "@type": "Offer",
      url: offer.link,
      priceCurrency: "BRL",
      price: Number(offer.priceCurrent || 0).toFixed(2),
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: "Mercado Livre" },
      areaServed: { "@type": "City", name: "Guarujá", addressRegion: "SP", addressCountry: "BR" }
    }
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Início", item: SITE.origin + "/" },
      { "@type": "ListItem", position: 2, name: offer.title, item: `${SITE.origin}/oferta/${offer.slug}/` }
    ]
  };

  const tagsHtml = (offer.tags || [])
    .map(
      (t) =>
        `<a class="taglink" href="/tag/${escapeHtml(t)}/">#${escapeHtml(humanizeTag(t))}</a>`
    )
    .join("");

  const oldPrice =
    typeof offer.priceOld === "number" && offer.priceOld > offer.priceCurrent
      ? `<span class="detail__price-old">${escapeHtml(brl(offer.priceOld))}</span>`
      : "";
  const discount =
    offer.discount && offer.discount >= 5
      ? `<span class="detail__discount">${offer.discount}% OFF</span>`
      : "";

  const body = `
    <section class="detail">
      <div class="container detail__grid">
        <nav class="breadcrumb" aria-label="Trilha de navegação">
          <a href="/">Início</a> <span aria-hidden="true">›</span> <span>${escapeHtml(offer.title)}</span>
        </nav>
        <div class="detail__media">
          ${
            offer.image
              ? `<img src="${escapeHtml(offer.image)}" alt="${escapeHtml(offer.imageAlt || offer.title)}" loading="eager" decoding="async" referrerpolicy="no-referrer">`
              : ""
          }
        </div>
        <div class="detail__body">
          <h1 class="detail__title">${escapeHtml(offer.title)}</h1>
          ${
            offer.description
              ? `<p class="detail__desc">${escapeHtml(offer.description)}</p>`
              : ""
          }
          <div class="detail__price">
            <span class="detail__price-current">${escapeHtml(brl(offer.priceCurrent || 0))}</span>
            ${oldPrice}
            ${discount}
          </div>
          <a class="btn btn--primary detail__cta" href="${link}" target="_blank" rel="noopener nofollow sponsored">
            Aproveitar no Mercado Livre
          </a>
          <p class="detail__legal">Você é redirecionado para o Mercado Livre, onde a compra é finalizada com a proteção da plataforma.</p>
          ${
            tagsHtml
              ? `<div class="detail__tags" aria-label="Categorias relacionadas"><span>Categorias:</span>${tagsHtml}</div>`
              : ""
          }
          <ul class="detail__bullets">
            <li>Entrega para Guarujá-SP, Vicente de Carvalho, Enseada, Pitangueiras e região.</li>
            <li>Curadoria manual da Delma — só publico se eu compraria.</li>
            <li>Compra no Mercado Livre, com proteção da plataforma.</li>
          </ul>
        </div>
      </div>
    </section>
    ${
      others.length
        ? `<section class="offers offers--others">
             <div class="container">
               <header class="section-head">
                 <h2>Mais ofertinhas pra Guarujá</h2>
                 <p>Achadinhos recentes que talvez você também goste.</p>
               </header>
               <ul class="offers__grid" role="list">${others.map(offerCard).join("")}</ul>
             </div>
           </section>`
        : ""
    }
  `;

  return htmlResponse(
    layout({
      title: seoTitle,
      description: seoDescription,
      canonical: `/oferta/${offer.slug}/`,
      body,
      offers: all,
      ogImage: offer.image,
      jsonLd: [productLd, breadcrumbLd]
    })
  );
}
