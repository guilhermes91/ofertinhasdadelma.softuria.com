// Bot de captação automática: descobre ofertas de Mercado Livre nos portais,
// dedup contra o catálogo, enriquece via Gemini (mesma mecânica do /captar) e
// auto-publica. Protegido por token (BOT_TOKEN). Disparado pelo GitHub Actions
// (cron) — que vem DESARMADO por padrão (ver .github/workflows/bot.yml).
//
// Uso: POST/GET /api/bot?max=8[&dry=1]  com  Authorization: Bearer <BOT_TOKEN>

import { scrapeOffer } from "../_lib/scraper.js";
import {
  loadOffers,
  saveOffers,
  ensureOffer,
  upsertOffer,
  normalizeLink,
  slugify,
  uniqueSlug
} from "../_lib/data.js";
import { jsonResponse } from "../_lib/render.js";
import { discoverMlOffers } from "../_lib/portals.js";
import { generateAffiliate, mlKeepalive } from "../_lib/affiliate.js";

const DEFAULT_MAX = 8; // teto por execução — protege a cota do Gemini
const HARD_MAX = 20;

export async function onRequestPost(context) {
  return run(context);
}
export async function onRequestGet(context) {
  return run(context);
}

async function run(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Token gate — fail closed. Aceita env var OU KV (bot:token) — assim dá pra armar
  // sem mexer nas env vars do Pages (que poderiam apagar outros secrets).
  const expected = env.BOT_TOKEN || (await env.OFFERS_KV.get("bot:token"));
  if (!expected) {
    return jsonResponse(
      { error: "BOT_TOKEN não configurado (nem env nem KV bot:token)." },
      { status: 503 }
    );
  }
  const provided =
    (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token") ||
    "";
  if (provided !== expected) {
    return jsonResponse({ error: "Token inválido." }, { status: 401 });
  }

  const max = Math.min(
    parseInt(url.searchParams.get("max") || "", 10) || DEFAULT_MAX,
    HARD_MAX
  );
  const dry = url.searchParams.get("dry") === "1";

  // keepalive da sessão de afiliado ML (se houver) pra não expirar
  try {
    const sess = await env.OFFERS_KV.get("ml:session");
    if (sess) {
      const k = await mlKeepalive(sess);
      if (k.ok && k.cookies) await env.OFFERS_KV.put("ml:session", k.cookies);
    }
  } catch (_) { /* noop */ }

  let candidates = [];
  try {
    candidates = await discoverMlOffers();
  } catch (err) {
    return jsonResponse(
      { error: "Falha na descoberta: " + (err.message || "") },
      { status: 502 }
    );
  }

  const all = await loadOffers(env);
  const existing = new Set(all.map((o) => normalizeLink(o.link)));
  const fresh = candidates
    .filter((l) => !existing.has(normalizeLink(l)))
    .slice(0, max);

  const added = [];
  const refreshed = [];
  const errors = [];
  const noAffiliate = []; // ofertas que ficaram com URL limpa (sessão ML caída) → relinkar depois
  let offers = all;

  for (const link of fresh) {
    try {
      const scraped = await scrapeOffer(link, env);
      if (!scraped.title || scraped.priceCurrent == null) {
        errors.push({ link, reason: "sem título ou preço" });
        continue;
      }
      const slug = uniqueSlug(
        slugify(scraped.title || "oferta"),
        offers.map((o) => o.slug)
      );
      // ⚠️ COMPLIANCE: NUNCA salvar `link` (o meli.la da FONTE carrega a tag do
      // concorrente — Promotop etc. — e creditaria comissão a ele). Só o NOSSO link
      // de afiliado ou, se a geração falhar, a URL de produto LIMPA (sem tag).
      const aff = await generateAffiliate(scraped.productUrl, env);
      if (!aff) noAffiliate.push({ link, mlId: scraped.mlId });
      const candidate = ensureOffer({ ...scraped, slug, link: aff || scraped.productUrl, seller: "Mercado Livre" });
      // dedup por id do produto; só refresca (e sobe) se o preço mudou — sem churn.
      const r = upsertOffer(offers, candidate, { onlyIfChanged: true, bumpToTop: true });
      offers = r.offers;
      const info = { slug: r.offer.slug, title: r.offer.title, price: r.offer.priceCurrent };
      if (r.action === "added") added.push(info);
      else if (r.action === "refreshed") refreshed.push(info);
    } catch (err) {
      errors.push({ link, reason: err.message || "falha no scrape" });
    }
  }

  if (!dry && (added.length || refreshed.length)) {
    await saveOffers(env, offers);
  }

  return jsonResponse({
    ok: true,
    source: "promotop+pechinchou",
    candidates: candidates.length,
    fresh: fresh.length,
    added: added.length,
    refreshed: refreshed.length,
    noAffiliate: noAffiliate.length,
    dry,
    items: added,
    refreshedItems: refreshed,
    noAffiliateItems: noAffiliate,
    errors
  });
}
