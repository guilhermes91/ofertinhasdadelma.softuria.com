// Discovery de ofertas em portais de promoção. Parsers puros + uma camada fina de
// fetch, pra o MESMO código rodar no edge (cron) e no harness local. Cada fonte devolve
// candidatos `{url, price?, priceOld?, coupon?}` — preço/cupom CURADOS pela fonte são
// autoritativos (mais confiáveis que ler o card /social do ML). Auditado fonte a fonte
// no War Room de 2026-05-31 (ver CONTEXTO §6.9.5).

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ----- helpers comuns -----

function cleanLink(raw) {
  let u = (Array.isArray(raw) ? raw[0] : raw) || "";
  u = u.replace(/&amp;/g, "&").replace(/[)\].,'"<>]+$/g, "");
  return u;
}

// "1.931,40" -> 1931.40 ; "137,49" -> 137.49
function parseBrl(s) {
  const n = Number(String(s).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// código de cupom DIGITÁVEL de verdade (sem espaços, alfanumérico). Rejeita textos como
// "APLICAR CUPOM DE 15%" ou "Resgate o Cupom..." que não são código.
function looksLikeCode(s) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{2,23}$/.test(String(s || "").trim());
}

function mkCoupon(code, source) {
  return { code: String(code).trim().toUpperCase().slice(0, 24), text: "Cupom no Mercado Livre", source };
}

async function fetchHtml(url, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" },
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// acha o MAIOR array de objetos do __NEXT_DATA__ cujo 1º item tem alguma das chaves dadas
function nextDataArray(html, hasKey) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data;
  try { data = JSON.parse(m[1]); } catch (_) { return null; }
  let arr = null;
  (function w(o) {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o) && o.length && o[0] && typeof o[0] === "object" && hasKey.some((k) => k in o[0])) {
      if (!arr || o.length > arr.length) arr = o;
    }
    for (const k of Object.keys(o)) if (o[k] && typeof o[k] === "object") w(o[k]);
  })(data);
  return arr;
}

const ML_DEST_RE = /^https?:\/\/([a-z0-9.-]*\.)?(mercadolivre\.com\.br|meli\.la)\//i;

// =========================== PROMOTOP (WordPress/ReHub, HTML) ===========================
// 1 fetch. Cupom em data-clipboard-text, preço em rh_regular_price, link meli.la — tudo
// no <article>. Parsear por artigo é OBRIGATÓRIO (cupons duplicam em vários widgets).
const PROMOTOP_SOURCE = "https://promotop.net/loja/mercado-livre/";

function parsePromotop(html) {
  const out = [];
  const seen = new Set();
  const parts = html.split(/<article class="col_item offer_grid/);
  for (let i = 1; i < parts.length; i++) {
    const b = parts[i].split("</article>")[0];
    const mlM =
      b.match(/href="(https:\/\/meli\.la\/[^"]+)"/) ||
      b.match(/href="(https:\/\/(?:www\.)?mercadolivre\.com(?:\.br)?\/[^"]+)"/);
    if (!mlM) continue; // não é oferta de Mercado Livre
    const url = cleanLink(mlM[1]);
    if (seen.has(url)) continue;
    seen.add(url);
    const item = { url };
    const pM = b.match(/rh_regular_price">\s*R\$\s*([\d.]+,\d{2})/);
    if (pM) { const p = parseBrl(pM[1]); if (p) item.price = p; }
    // priceOld não existe nesta fonte — não inventar.
    const cM = b.match(/data-clipboard-text="([^"]+)"/);
    if (cM && looksLikeCode(cM[1])) item.coupon = mkCoupon(cM[1], "promotop");
    out.push(item);
  }
  return out;
}

export async function crawlPromotop(fetchImpl = fetch) {
  try { return parsePromotop(await fetchHtml(PROMOTOP_SOURCE, fetchImpl)); }
  catch (_) { return []; }
}

// =========================== PECHINCHOU (Next.js, __NEXT_DATA__) ===========================
// Preço + cupom (campo `coupons[]`) curados. CRÍTICO: filtrar por store (mercado-livre),
// NÃO por regex de URL — eles usam meli.la, mercadolivre.com/sec/ E bit.ly p/ ML (a regex
// antiga perdia ~45% das ofertas, incluindo com cupom).
export const PECHINCHOU_SOURCES = [
  "https://www.pechinchou.com.br/",
  "https://www.pechinchou.com.br/lojas/mercado-livre"
];

function isMercadoLivreStore(o) {
  const s = (o.store && (o.store.slug || o.store.name)) || o.store_slug || o.slug_url || "";
  return /mercado-?\s*livre/i.test(String(s));
}

function pechinchouOffers(html) {
  const arr = nextDataArray(html, ["short_url", "long_url"]);
  if (!arr) return [];
  const out = [];
  for (const o of arr) {
    if (!isMercadoLivreStore(o)) continue; // filtra por LOJA, não por domínio da url
    const url = o.short_url || o.long_url || "";
    if (!url) continue;
    const item = { url };
    // o `price` da pechinchou vem como número-string com ponto decimal ("144.49")
    const p = Number(o.price);
    if (Number.isFinite(p) && p > 0) item.price = p;
    const old = Number(o.old_price);
    if (Number.isFinite(old) && old > 0) item.priceOld = old;
    const code = Array.isArray(o.coupons) && o.coupons[0] ? String(o.coupons[0]).trim() : "";
    if (looksLikeCode(code)) item.coupon = mkCoupon(code, "pechinchou");
    out.push(item);
  }
  return out;
}

export async function crawlPechinchou(fetchImpl = fetch) {
  const byUrl = new Map();
  for (const src of PECHINCHOU_SOURCES) {
    try {
      for (const o of pechinchouOffers(await fetchHtml(src, fetchImpl))) {
        if (!byUrl.has(o.url) || (o.coupon && !byUrl.get(o.url).coupon)) byUrl.set(o.url, o);
      }
    } catch (_) {
      // uma página falhar não derruba a outra
    }
  }
  return [...byUrl.values()];
}

// =========================== PELANDO (Astro, estado entity-encoded) ===========================
// O feed /recentes traz por oferta: price + sourceUrl (ML direto) + slug, inline (entity-
// encoded &quot;). O CUPOM (couponCode) NÃO está no feed — só na página /d/<slug>. Usamos o
// dpl (que resolve /social com imagem+preço) como url de scrape e o preço do feed como
// autoritativo; buscamos cupom em /d/ só nas primeiras N (bound de subrequests).
export const PELANDO_SOURCES = ["https://www.pelando.com.br/recentes"];
const PELANDO_MAX_COUPON = 4;
const PELANDO_DPL_RE = /dpl\.pelando\.com\.br\/r\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g;

function pelandoDest(jwt) {
  const parts = String(jwt).split(".");
  if (parts.length < 2) return "";
  let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  try {
    const payload = JSON.parse(atob(b64));
    return payload && typeof payload.url === "string" ? payload.url : "";
  } catch (_) {
    return "";
  }
}

function parsePelandoFeed(dec) {
  const out = [];
  let m;
  let prevEnd = 0;
  PELANDO_DPL_RE.lastIndex = 0;
  while ((m = PELANDO_DPL_RE.exec(dec))) {
    const dest = pelandoDest(m[1]);
    const winStart = prevEnd;
    prevEnd = m.index + m[0].length;
    if (!dest || !ML_DEST_RE.test(dest)) continue; // só ML
    const win = dec.slice(Math.max(winStart, m.index - 2000), m.index);
    const item = { url: "https://dpl.pelando.com.br/r/" + m[1] };
    const pM = [...win.matchAll(/"price":\[0,([0-9.]+)\]/g)].pop();
    if (pM) { const p = Number(pM[1]); if (p > 0) item.price = p; }
    const sM = [...win.matchAll(/"slug":\[0,"([^"]+)"\]/g)].pop();
    if (sM) item.slug = sM[1];
    out.push(item);
  }
  return out;
}

export async function crawlPelando(fetchImpl = fetch) {
  let html;
  try { html = await fetchHtml(PELANDO_SOURCES[0], fetchImpl); } catch (_) { return []; }
  const dec = html.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const offers = parsePelandoFeed(dec);
  // cupom: 1 fetch por oferta em /d/<slug> → só nas primeiras N (bound de subrequests)
  let fetched = 0;
  for (const o of offers) {
    if (fetched >= PELANDO_MAX_COUPON) break;
    if (!o.slug) continue;
    fetched += 1;
    try {
      const d = (await fetchHtml("https://www.pelando.com.br/d/" + o.slug, fetchImpl)).replace(/&quot;/g, '"');
      const cM =
        d.match(/"couponCode":\[0,"([^"]+)"\]/) ||
        d.match(/data-code="([^"]+)"/) ||
        d.match(/class="code">([^<]+)</);
      if (cM && looksLikeCode(cM[1])) o.coupon = mkCoupon(cM[1], "pelando");
    } catch (_) {
      // sem cupom; segue com price+url
    }
  }
  return offers.map(({ slug, ...rest }) => rest);
}

// =========================== PROMOBIT (Next.js, __NEXT_DATA__ + interstitial) ===========================
// __NEXT_DATA__ da loja-ML tem offerPrice (preço COM cupom) + offerCoupon (código real) +
// offerOldPrice. O link ML de cada oferta sai do interstitial /Redirect/to/<id> (301 →
// /<id>/ com o meli.la inline; ~100% das ML resolvem). Teto de interstitials por execução.
export const PROMOBIT_SOURCES = ["https://www.promobit.com.br/promocoes/loja/mercado-livre/"];
const PROMOBIT_MAX_RESOLVE = 6;
const PROMOBIT_ML_RE = /https?:\/\/(?:www\.)?(?:mercadolivre\.com\.br|meli\.la)\/[^\s"'<>\\]+/;

function promobitOffers(html) {
  const arr = nextDataArray(html, ["offerId"]);
  if (!arr) return [];
  return arr
    .filter((o) => /mercadolivre/i.test(o.storeDomain || ""))
    .map((o) => ({
      id: o.offerId,
      coupon: looksLikeCode(o.offerCoupon) ? o.offerCoupon : null,
      price: Number(o.offerPrice) || null,
      priceOld: Number(o.offerOldPrice) || null
    }))
    .filter((o) => o.id);
}

export async function crawlPromobit(fetchImpl = fetch) {
  const out = [];
  let html;
  try { html = await fetchHtml(PROMOBIT_SOURCES[0], fetchImpl); } catch (_) { return out; }
  // prioriza ofertas COM cupom (o diferencial do Promobit) antes de gastar o teto
  const offers = promobitOffers(html).sort((a, b) => (b.coupon ? 1 : 0) - (a.coupon ? 1 : 0));
  for (const o of offers.slice(0, PROMOBIT_MAX_RESOLVE)) {
    try {
      const intHtml = await fetchHtml("https://www.promobit.com.br/Redirect/to/" + o.id, fetchImpl);
      const m = intHtml.match(PROMOBIT_ML_RE);
      if (!m) continue; // item não-ML (ex.: Mercado Pago via linksynergy) → pula
      const item = { url: m[0] };
      if (o.coupon) item.coupon = mkCoupon(o.coupon, "promobit");
      if (o.price) item.price = o.price;
      if (o.priceOld) item.priceOld = o.priceOld;
      out.push(item);
    } catch (_) {
      // pula esta oferta
    }
  }
  return out;
}

// =========================== AGREGADOR ===========================
// Cada fonte devolve {url, price?, priceOld?, coupon?}. Normaliza e dedup por url,
// mantendo o item com mais dado (cupom/preço).
export async function discoverMlOffers(fetchImpl = fetch) {
  const [promotop, pechinchou, pelando, promobit] = await Promise.all([
    crawlPromotop(fetchImpl),
    crawlPechinchou(fetchImpl),
    crawlPelando(fetchImpl),
    crawlPromobit(fetchImpl)
  ]);
  const byUrl = new Map();
  const add = (item) => {
    const o = typeof item === "string" ? { url: item } : item;
    if (!o || !o.url) return;
    const prev = byUrl.get(o.url);
    if (!prev) { byUrl.set(o.url, o); return; }
    byUrl.set(o.url, {
      url: o.url,
      coupon: prev.coupon || o.coupon,
      price: prev.price ?? o.price,
      priceOld: prev.priceOld ?? o.priceOld
    });
  };
  [...promotop, ...pechinchou, ...pelando, ...promobit].forEach(add);
  return [...byUrl.values()];
}
