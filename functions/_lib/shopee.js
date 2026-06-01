// Captação de ofertas da SHOPEE via API de scraping TERCEIRIZADA (externa).
// A extração de dados (nome/preço/imagem/descrição) é responsabilidade da API; aqui só
// montamos a oferta no shape do catálogo e reusamos o enrich (Gemini) compartilhado do
// scraper do ML. Mesmo padrão de delegação da geração de link (affiliate.js).
//
// Config — vai em env var do Pages, FORA do repo (repo é público):
//   SHOPEE_SCRAPE_API_URL  endpoint completo (ex.: https://<host>/scrape)
//   SHOPEE_SCRAPE_TOKEN    Bearer token da API
// Sem as envs → erro claro (não publica nada).

import { slugify } from "./data.js";
import { enrichWithGemini } from "./scraper.js";

const SHOPEE_HOST = /(?:^|\.)shopee\.com\.br$/i;
const STORE = "Shopee";
const TIMEOUT_MS = 60000; // a API não é instantânea (checklist do dono: timeout alto)

export function isShopeeUrl(value) {
  try {
    return SHOPEE_HOST.test(new URL(normalize(value)).hostname);
  } catch {
    return false;
  }
}

// Extrai {shopid, itemid} dos formatos de link da Shopee:
//   .../<nome>-i.SHOPID.ITEMID   (link comum de produto)
//   .../product/SHOPID/ITEMID    (link canônico)
export function shopeeIds(value) {
  const s = String(value || "");
  let m = s.match(/i\.(\d{3,})\.(\d{3,})/);
  if (m) return { shopid: m[1], itemid: m[2] };
  m = s.match(/\/product\/(\d{3,})\/(\d{3,})/);
  if (m) return { shopid: m[1], itemid: m[2] };
  return null;
}

// URL canônica LIMPA (sem tag) — serve de link de clique E de chave de dedup estável
// (Shopee não tem mlId; o findDuplicateIndex cai pro link normalizado).
export function shopeeCanonical(shopid, itemid) {
  return `https://shopee.com.br/product/${shopid}/${itemid}`;
}

// Pipeline Shopee (scrape terceirizado + enrich). Retorna shape compatível com o que o
// /captar espera de scrapeOffer (priceCurrent, image, title, sourceUrl, productUrl, ...).
export async function scrapeShopee(rawUrl, env) {
  const ids = shopeeIds(rawUrl);
  if (!ids) {
    throw new Error(
      "Link da Shopee inválido. Use o link de um produto (ex.: shopee.com.br/...-i.<loja>.<item>)."
    );
  }
  const base = env && env.SHOPEE_SCRAPE_API_URL;
  const token = env && env.SHOPEE_SCRAPE_TOKEN;
  if (!base || !token) {
    throw new Error(
      "Captação da Shopee não está configurada (faltam SHOPEE_SCRAPE_API_URL / SHOPEE_SCRAPE_TOKEN)."
    );
  }

  const item = await fetchShopee(base, token, normalize(rawUrl));
  if (!item || item.status !== "ok") {
    const why = item && item.erro ? `: ${item.erro}` : ".";
    throw new Error(`Não consegui ler esse produto da Shopee${why}`);
  }

  const canonical = shopeeCanonical(ids.shopid, ids.itemid);
  const raw = {
    title: String(item.name || item.text || "").replace(/\s+/g, " ").trim(),
    image: String(item.image || "").trim(),
    description: String(item.description || "").trim(),
    priceCurrent: numberOrNull(item.preco != null ? item.preco : item.price),
    priceOld: null,
    discount: null,
    bestseller: false
  };

  const enriched = await enrichWithGemini(raw, canonical, env, STORE);

  return {
    mlId: "", // Shopee não tem MLB; dedup cai pro link canônico
    productUrl: canonical,
    sourceUrl: canonical, // limpo, sem tag de terceiro (compliance)
    title: enriched.title || raw.title || "",
    description: enriched.description || raw.description.slice(0, 180) || "",
    seoTitle: enriched.seoTitle || "",
    seoDescription: enriched.seoDescription || "",
    image: raw.image,
    imageAlt: enriched.imageAlt || raw.title || "",
    priceCurrent: raw.priceCurrent,
    priceOld: null,
    discount: null,
    link: canonical,
    tags: Array.isArray(enriched.tags)
      ? enriched.tags.slice(0, 5).map((t) => slugify(t)).filter(Boolean)
      : [],
    bestseller: false,
    isNew: true,
    coupon: null,
    store: "shopee",
    seller: STORE
  };
}

async function fetchShopee(base, token, url) {
  const endpoint = String(base).replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ urls: [url] }),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`API da Shopee respondeu HTTP ${res.status}.`);
    const data = await res.json();
    const list = Array.isArray(data && data.resultados) ? data.resultados : [];
    return list[0] || null;
  } finally {
    clearTimeout(timer);
  }
}

function normalize(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function numberOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
