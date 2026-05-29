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

async function fetchHtml(url, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" },
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function crawlPromotop(fetchImpl = fetch) {
  const links = new Set();
  for (const url of PROMOTOP_SOURCES) {
    try {
      const html = await fetchHtml(url, fetchImpl);
      for (const l of extractMlLinks(html)) links.add(l);
    } catch (_) {
      // uma fonte falhar não derruba o resto
    }
  }
  return [...links];
}

// Agregador de descoberta. Por ora só Promotop.
export async function discoverMlOffers(fetchImpl = fetch) {
  return crawlPromotop(fetchImpl);
}
