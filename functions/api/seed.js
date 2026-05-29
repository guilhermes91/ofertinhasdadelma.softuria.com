// Seeds the catalog with the 2 initial offers if KV is still empty.
// POST /api/seed (admin-only via middleware).

import { loadOffers, saveOffers, ensureOffer, slugify, uniqueSlug } from "../_lib/data.js";
import { jsonResponse } from "../_lib/render.js";

const SEED = [
  {
    title: "10 Calcinhas Infantis de Algodão para Menina",
    description:
      "Kit com 10 peças tradicionais em algodão macio. Custo bom pra repor o guarda-roupa das pequenas sem pesar.",
    seoTitle: "10 Calcinhas Infantis de Algodão em oferta — Mercado Livre",
    seoDescription:
      "Kit com 10 calcinhas infantis de algodão por preço bom no Mercado Livre, com link direto.",
    image:
      "https://http2.mlstatic.com/D_Q_NP_2X_641838-MLB80679685426_112024-V-10-calcinha-infantil-algodo-tradicional-menina-atacado.webp",
    imageAlt: "Kit com 10 calcinhas infantis de algodão coloridas",
    priceCurrent: 32.9,
    priceOld: null,
    discount: null,
    link: "https://meli.la/1eWz4f9",
    tags: ["moda-infantil", "calcinhas", "atacado", "menina", "algodao"],
    bestseller: true,
    isNew: false,
    seller: "Mercado Livre",
    addedAt: "2026-05-05T12:00:00Z"
  },
  {
    title: "Cola de Contato Tekbond Amarela 30g",
    description:
      "Cola de contato versátil pra calçado, couro, borracha e tecido. A bisnaga de bolso quebra galho em casa, na oficina e na correria do dia a dia.",
    seoTitle: "Cola de Contato Tekbond 30g em oferta — Mercado Livre",
    seoDescription:
      "Cola Tekbond amarela 30g por preço bom no Mercado Livre, com link direto. Frete e estoque conferidos.",
    image: "https://http2.mlstatic.com/D_Q_NP_2X_660121-MLA100109699395_122025-V.webp",
    imageAlt: "Bisnaga amarela de cola de contato Tekbond para sapateiro",
    priceCurrent: 19.0,
    priceOld: 21.99,
    discount: 13,
    link: "https://meli.la/2rLcLqj",
    tags: ["ferramentas", "cola", "consertos", "tekbond", "sapateiro"],
    bestseller: false,
    isNew: true,
    seller: "Mercado Livre",
    addedAt: "2026-05-06T12:00:00Z"
  }
];

export async function onRequestPost(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const existing = await loadOffers(env);
  if (existing.length && !force) {
    return jsonResponse({ ok: false, message: "KV não está vazio. Use ?force=1 para sobrescrever." });
  }

  const offers = [];
  for (const item of SEED) {
    const slug = uniqueSlug(slugify(item.title), offers.map((o) => o.slug));
    offers.push(ensureOffer({ ...item, slug }));
  }
  await saveOffers(env, offers);
  return jsonResponse({ ok: true, count: offers.length, offers });
}
