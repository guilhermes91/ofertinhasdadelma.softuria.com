// Discovery de ofertas em portais de promoção. Parsers puros + uma camada fina
// de fetch, pra o MESMO código rodar no edge (cron) e no harness de teste local.
//
// MVP: só Promotop, que expõe links do Mercado Livre direto no HTML server-side
// (home + página da loja ML). Canaltech e Pelando renderizam no cliente (0 links
// no HTML do servidor) — ficam pra fase 2. Ver CONTEXTO.md §6.3.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Links de produto do Mercado Livre (curto meli.la ou domínio cheio).
const ML_LINK_RE =
  /https?:\/\/(?:www\.)?(?:mercadolivre\.com\.br|meli\.la)\/[^"'\s<>\\]+/gi;

export function extractMlLinks(html) {
  if (!html) return [];
  const found = [...html.matchAll(ML_LINK_RE)].map(cleanLink).filter(Boolean);
  return [...new Set(found)];
}

function cleanLink(raw) {
  let u = (Array.isArray(raw) ? raw[0] : raw) || "";
  u = u.replace(/&amp;/g, "&");
  // remove pontuação/aspas que o regex possa ter agarrado no fim
  u = u.replace(/[)\].,'"<>]+$/g, "");
  return u;
}

export const PROMOTOP_SOURCES = [
  "https://promotop.net/loja/mercado-livre",
  "https://promotop.net/"
];
export const PECHINCHOU_SOURCES = [
  "https://www.pechinchou.com.br/"
];
// Pelando: a HOME é client-side (0 links no HTML), mas /recentes vem renderizado no
// servidor (RSC). Os links de saída são `dpl.pelando.com.br/r/<JWT>` com a URL de
// destino em base64 no payload do token. Feed é MISTO (ML, Shopee, Amazon) → filtramos
// só os de ML por ora. O dpl redireciona pra /social/pelando?ref= (HTML cheio c/ preço),
// igual ao meli.la — por isso o scraper segue o dpl (REDIRECTOR_HOSTS). Provado 4/4.
export const PELANDO_SOURCES = [
  "https://www.pelando.com.br/recentes"
];

const PELANDO_DPL_RE = /dpl\.pelando\.com\.br\/r\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g;
const ML_DEST_RE = /^https?:\/\/([a-z0-9.-]*\.)?(mercadolivre\.com\.br|meli\.la)\//i;

// Decodifica o destino (campo .url) do payload base64url de um JWT do Pelando.
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

export async function crawlPelando(fetchImpl = fetch) {
  const links = new Set();
  for (const src of PELANDO_SOURCES) {
    try {
      const html = await fetchHtml(src, fetchImpl);
      for (const m of html.matchAll(PELANDO_DPL_RE)) {
        const dest = pelandoDest(m[1]);
        // só ML por enquanto; o dpl é o que o scraper segue (resolve /social c/ preço)
        if (dest && ML_DEST_RE.test(dest)) links.add("https://dpl.pelando.com.br/r/" + m[1]);
      }
    } catch (_) {
      // uma fonte falhar não derruba o resto
    }
  }
  return [...links];
}

// Promobit: a página da loja expõe as ofertas no __NEXT_DATA__ (preço + CÓDIGO de cupom
// DIGITÁVEL em `offerCoupon`, ex.: "SOHOJE"), mas o link de saída de CADA oferta exige
// um salto pelo interstitial /Redirect/to/<offerId> (onde o meli.la está no HTML). ~50%
// das ofertas resolvem server-side; as "highlight" carregam via JS e são puladas. As COM
// cupom resolvem bem — e são o valor do Promobit. Retorna {url, coupon?} (contrato rico).
export const PROMOBIT_SOURCES = [
  "https://www.promobit.com.br/promocoes/loja/mercado-livre/"
];
const PROMOBIT_MAX_RESOLVE = 8; // teto de interstitials/execução (bound de subrequests)
const PROMOBIT_ML_RE = /https?:\/\/(?:www\.)?(?:mercadolivre\.com\.br|meli\.la)\/[^\s"'<>\\]+/;

function promobitOffers(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return [];
  let data;
  try { data = JSON.parse(m[1]); } catch (_) { return []; }
  let arr = null;
  (function w(o) {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o) && o.length && o[0] && typeof o[0] === "object" && "offerId" in o[0]) {
      if (!arr || o.length > arr.length) arr = o;
    }
    for (const k of Object.keys(o)) if (o[k] && typeof o[k] === "object") w(o[k]);
  })(data);
  if (!arr) return [];
  return arr
    .filter((o) => /mercadolivre/i.test(o.storeDomain || ""))
    .map((o) => ({ id: o.offerId, coupon: o.offerCoupon || null }))
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
      if (!m) continue; // carrega via JS → pula
      out.push(
        o.coupon
          ? { url: m[0], coupon: { code: o.coupon, text: "Cupom Promobit no Mercado Livre", source: "promobit" } }
          : { url: m[0] }
      );
    } catch (_) {
      // pula esta oferta
    }
  }
  return out;
}

async function fetchHtml(url, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" },
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function crawl(sources, fetchImpl) {
  const links = new Set();
  for (const url of sources) {
    try {
      const html = await fetchHtml(url, fetchImpl);
      for (const l of extractMlLinks(html)) links.add(l);
    } catch (_) {
      // uma fonte falhar não derruba o resto
    }
  }
  return [...links];
}

export const crawlPromotop = (fetchImpl = fetch) => crawl(PROMOTOP_SOURCES, fetchImpl);
export const crawlPechinchou = (fetchImpl = fetch) => crawl(PECHINCHOU_SOURCES, fetchImpl);

// Agregador de descoberta. Cada fonte devolve string (link) OU {url, coupon}. Normaliza
// tudo pra {url, coupon?} e dedup por url (preferindo o item que tem cupom).
// Fontes: Promotop + Pechinchou (links ML diretos) + Pelando /recentes (dpl→/social) +
// Promobit (interstitial + cupom digitável).
export async function discoverMlOffers(fetchImpl = fetch) {
  const [promotop, pechinchou, pelando, promobit] = await Promise.all([
    crawl(PROMOTOP_SOURCES, fetchImpl),
    crawl(PECHINCHOU_SOURCES, fetchImpl),
    crawlPelando(fetchImpl),
    crawlPromobit(fetchImpl)
  ]);
  const byUrl = new Map();
  const add = (item) => {
    const o = typeof item === "string" ? { url: item } : item;
    if (!o || !o.url) return;
    if (!byUrl.has(o.url) || (o.coupon && !byUrl.get(o.url).coupon)) byUrl.set(o.url, o);
  };
  [...promotop, ...pechinchou, ...pelando, ...promobit].forEach(add);
  return [...byUrl.values()];
}
