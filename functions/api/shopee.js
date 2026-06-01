// Captação automática da SHOPEE — fluxo ISOLADO do bot de ML. Shopee é lento (~20s/item
// via Chrome real na API), então NUNCA divide run com o ML (um item lento poderia matar o
// run e perder as capturas de ML). Aqui: descobre candidatos Shopee no feed do Pelando,
// gera o NOSSO link via /completo (1 chamada por item) e publica. Teto baixo + time-budget.
// Token-gated (BOT_TOKEN), igual /api/bot. Cron próprio em shopee.yml.

import { discoverShopeeOffers } from "../_lib/portals.js";
import { completeOffer } from "../_lib/affiliate.js";
import { enrichOffer } from "../_lib/scraper.js";
import {
  loadOffers,
  saveOffers,
  ensureOffer,
  upsertOffer,
  normalizeLink,
  slugify,
  uniqueSlug,
  OUR_SHOPEE_AFFID
} from "../_lib/data.js";
import { isShopeeUrl, shopeeIds, shopeeCanonical } from "../_lib/shopee.js";
import { jsonResponse } from "../_lib/render.js";
import { constantTimeEquals } from "../_lib/auth.js";

const DEFAULT_MAX = 2; // ofertas Shopee NOVAS por execução (cada ~20s)
const HARD_MAX = 4;
const ITEM_TIMEOUT_MS = 40000; // teto duro por item (Shopee ~20s + margem)
const TIME_BUDGET_MS = 70000; // para de começar item novo após isto (proteção de wall-time)

export async function onRequestPost(context) {
  return run(context);
}
export async function onRequestGet(context) {
  return run(context);
}

async function run({ request, env }) {
  const url = new URL(request.url);
  const expected = env.BOT_TOKEN || (await env.OFFERS_KV.get("bot:token"));
  if (!expected) return jsonResponse({ error: "BOT_TOKEN não configurado." }, { status: 503 });
  const provided =
    (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token") ||
    "";
  if (!constantTimeEquals(provided, expected)) return jsonResponse({ error: "Token inválido." }, { status: 401 });

  const max = Math.min(parseInt(url.searchParams.get("max") || "", 10) || DEFAULT_MAX, HARD_MAX);
  const dry = url.searchParams.get("dry") === "1";

  let candidates = [];
  try {
    candidates = await discoverShopeeOffers();
  } catch (err) {
    return jsonResponse({ error: "Falha na descoberta Shopee: " + (err.message || "") }, { status: 502 });
  }

  const all = await loadOffers(env);
  // dedup por URL canônica (Shopee não tem mlId; o canônico shopee.com.br/product/<s>/<i>
  // guardado em sourceUrl é a chave de identidade do produto).
  const seen = new Set(all.filter((o) => o.sourceUrl).map((o) => normalizeLink(o.sourceUrl)));

  const added = [];
  const refreshed = []; // bump pela regra (caiu de preço OU >48h)
  const updated = [];   // dados corrigidos in-place, SEM bump
  const errors = [];
  let offers = all;
  let processed = 0;
  const start = Date.now();

  for (const candUrl of candidates) {
    if (added.length >= max) break;
    if (Date.now() - start > TIME_BUDGET_MS) break; // não começa item novo perto do limite
    if (!isShopeeUrl(candUrl)) continue;
    const ids = shopeeIds(candUrl);
    if (!ids) continue;
    const canonical = shopeeCanonical(ids.shopid, ids.itemid);
    if (seen.has(normalizeLink(canonical))) continue; // já temos esse produto

    processed += 1;
    let api;
    try {
      api = await completeOffer(candUrl, env, ITEM_TIMEOUT_MS);
    } catch (err) {
      errors.push({ link: candUrl, reason: "completeOffer: " + (err.message || "") });
      continue;
    }
    if (!api || !api.link || !api.image || api.price == null) {
      errors.push({ link: canonical, reason: "shopee incompleto/anti-bot" });
      continue;
    }
    // COMPLIANCE: só publica se o link for o NOSSO (an_redir com nosso affiliate_id).
    if (!String(api.link).includes("affiliate_id=" + OUR_SHOPEE_AFFID)) {
      errors.push({ link: canonical, reason: "link não é nosso (affiliate_id)" });
      continue;
    }

    const base = {
      url: canonical,
      raw: { title: api.name, image: api.image, priceCurrent: api.price, priceOld: null, discount: null, bestseller: false },
      coupon: null,
      mlId: "",
      productUrl: canonical,
      sourceUrl: canonical
    };
    let off;
    try {
      off = await enrichOffer(base, env, "Shopee");
    } catch (err) {
      errors.push({ link: canonical, reason: "enrich: " + (err.message || "") });
      continue;
    }
    const slug = uniqueSlug(slugify(off.title || "oferta"), offers.map((o) => o.slug));
    // link = NOSSO an_redir (inline da API); store/seller Shopee. NÃO passa por relink.
    const candidate = ensureOffer({ ...off, slug, link: api.link, image: api.image, store: "shopee", seller: "Shopee" });
    const r = upsertOffer(offers, candidate, { repostRule: true });
    offers = r.offers;
    seen.add(normalizeLink(canonical));
    const info = { slug: r.offer.slug, title: r.offer.title, price: r.offer.priceCurrent };
    if (r.action === "added") added.push(info);
    else if (r.action === "refreshed") refreshed.push(info);
    else if (r.action === "updated") updated.push(info);
  }

  if (!dry && (added.length || refreshed.length || updated.length)) {
    await saveOffers(env, offers);
  }

  return jsonResponse({
    ok: true,
    source: "pelando-shopee",
    candidates: candidates.length,
    processed,
    added: added.length,
    reposted: refreshed.length, // bump pela regra (caiu de preço OU >48h)
    refreshed: refreshed.length, // alias histórico (compat)
    updated: updated.length, // dados corrigidos in-place, SEM bump
    dry,
    items: added,
    errors
  });
}
