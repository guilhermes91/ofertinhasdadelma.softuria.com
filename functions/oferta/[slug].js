import {
  loadPublicOffers,
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

  const all = await loadPublicOffers(env);
  const offer = all.find((o) => o.slug === slug);
  if (!offer) return notFound("Essa oferta saiu do ar.", all);

  // Relacionadas: prioriza ofertas que compartilham tag (linkagem interna mais
  // relevante p/ SEO e UX); cai pras mais recentes se não houver.
  const pool = all.filter((o) => o.id !== offer.id);
  const sameTag = (offer.tags || []).length
    ? pool.filter((o) => (o.tags || []).some((t) => offer.tags.includes(t)))
    : [];
  const others = sortByDateDesc(sameTag.length ? sameTag : pool).slice(0, 3);
  const link = safeUrl(offer.link) || "#";
  // Loja da oferta (ML ou Shopee) — parametriza copy/CTA/schema p/ não "mentir" a loja.
  const loja = offer.seller || "Mercado Livre";
  const seoTitle = offer.seoTitle || `${offer.title} em oferta — ${SITE.name}`;
  const seoDescription =
    offer.seoDescription ||
    `${offer.title} com preço bom e link direto na ${loja}. Veja antes que acabe.`;

  // Achadinho dura horas/dias, não 2 semanas. Janela curta = schema não "mente" preço
  // pro Google (preço inválido = perda de rich result). Ver War Room 2026-05-30.
  const priceValidUntil = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
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
      url: `${SITE.origin}/oferta/${offer.slug}/`,
      priceCurrency: "BRL",
      price: Number(offer.priceCurrent || 0).toFixed(2),
      priceValidUntil,
      itemCondition: "https://schema.org/NewCondition",
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: loja },
      areaServed: { "@type": "Country", name: "Brasil" }
    }
  };

  // Categoria (1ª tag) como nível intermediário do breadcrumb — trilha SEO + link interno
  // pra página de tag forte.
  const cat = (offer.tags || [])[0] || "";
  const catLabel = cat ? humanizeTag(cat) : "";
  const crumbItems = [{ "@type": "ListItem", position: 1, name: "Início", item: SITE.origin + "/" }];
  if (cat) crumbItems.push({ "@type": "ListItem", position: 2, name: catLabel, item: `${SITE.origin}/tag/${cat}/` });
  crumbItems.push({ "@type": "ListItem", position: crumbItems.length + 1, name: offer.title, item: `${SITE.origin}/oferta/${offer.slug}/` });
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbItems
  };

  // Cluster de hashtags (visão do dono: loja + cupom + categoria/marca + modelo).
  // Papéis com PÁGINA própria (categoria/marca) linkam /tag (SEO navegável); os de
  // DESCOBERTA (loja, modelo) linkam pra BUSCA — dá o "achar" sem criar página thin.
  const hashtags = [];
  if (offer.store) {
    hashtags.push(
      `<a class="taglink taglink--store" href="/?q=${encodeURIComponent(loja)}">#${escapeHtml(humanizeTag(offer.store)).replace(/\s+/g, "")}</a>`
    );
  }
  if (offer.coupon && (offer.coupon.code || offer.coupon.campaignId)) {
    hashtags.push(`<a class="taglink taglink--coupon" href="/?q=cupom">#Cupom</a>`);
  }
  for (const t of offer.tags || []) {
    hashtags.push(`<a class="taglink" href="/tag/${escapeHtml(t)}/">#${escapeHtml(humanizeTag(t))}</a>`);
  }
  if (offer.model) {
    hashtags.push(
      `<a class="taglink taglink--model" href="/?q=${encodeURIComponent(offer.model)}">#${escapeHtml(humanizeTag(offer.model)).replace(/\s+/g, "")}</a>`
    );
  }
  const tagsHtml = hashtags.join("");

  const couponHtml = offer.coupon && (offer.coupon.code || offer.coupon.campaignId)
    ? `<div class="detail__coupon" role="group" aria-label="Cupom de desconto">
         <span class="detail__coupon-icon" aria-hidden="true">🎟️</span>
         <div class="detail__coupon-info">
           <span class="detail__coupon-text">${escapeHtml(offer.coupon.text || "Cupom de desconto")}</span>
           ${
             offer.coupon.code
               ? `<button type="button" class="detail__coupon-code" data-coupon="${escapeHtml(offer.coupon.code)}" aria-label="Copiar cupom ${escapeHtml(offer.coupon.code)}"><code>${escapeHtml(offer.coupon.code)}</code><span class="detail__coupon-copy">Copiar</span></button>`
               : `<span class="detail__coupon-auto">Desconto já aplicado ao abrir na ${escapeHtml(loja)}.</span>`
           }
         </div>
       </div>`
    : "";

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
          <a href="/">Início</a> <span aria-hidden="true">›</span> ${
            cat ? `<a href="/tag/${escapeHtml(cat)}/">${escapeHtml(catLabel)}</a> <span aria-hidden="true">›</span> ` : ""
          }<span>${escapeHtml(offer.title)}</span>
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
          <div class="detail__price">
            <span class="detail__price-current">${escapeHtml(brl(offer.priceCurrent || 0))}</span>
            ${oldPrice}
            ${discount}
          </div>
          ${couponHtml}
          <a class="btn btn--primary detail__cta" href="${link}" target="_blank" rel="noopener nofollow sponsored">
            Aproveitar na ${escapeHtml(loja)}
          </a>
          <p class="detail__legal">Você é redirecionado para a ${escapeHtml(loja)}, onde a compra é finalizada com a proteção da plataforma.</p>
          ${
            offer.description
              ? `<p class="detail__desc">${escapeHtml(offer.description)}</p>`
              : ""
          }
          ${
            tagsHtml
              ? `<div class="detail__tags" aria-label="Categorias relacionadas"><span>Categorias:</span>${tagsHtml}</div>`
              : ""
          }
          <ul class="detail__bullets">
            <li>Entrega pra todo o Brasil pela ${escapeHtml(loja)}.</li>
            <li>Curadoria manual da Delma — só publico se eu compraria.</li>
            <li>Compra na ${escapeHtml(loja)}, com proteção da plataforma.</li>
          </ul>
          <p class="detail__reportline">
            <button type="button" class="detail__report" data-report="${escapeHtml(offer.id)}">⚠️ Reportar oferta quebrada ou esgotada</button>
          </p>
        </div>
      </div>
    </section>
    ${
      others.length
        ? `<section class="offers offers--others">
             <div class="container">
               <header class="section-head">
                 <h2>Mais ofertinhas pra você</h2>
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
