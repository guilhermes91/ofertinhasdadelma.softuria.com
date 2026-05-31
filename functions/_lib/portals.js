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

// Agregador de descoberta: Promotop + Pechinchou (links de ML diretos no HTML) +
// Pelando /recentes (dpl → /social, só destinos de ML). Dedup global por link.
export async function discoverMlOffers(fetchImpl = fetch) {
  const groups = await Promise.all([
    crawl(PROMOTOP_SOURCES, fetchImpl),
    crawl(PECHINCHOU_SOURCES, fetchImpl),
    crawlPelando(fetchImpl)
  ]);
  return [...new Set(groups.flat())];
}
