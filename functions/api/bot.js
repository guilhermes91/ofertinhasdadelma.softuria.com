// Bot de captação automática: descobre ofertas de Mercado Livre nos portais,
// dedup contra o catálogo, enriquece via Gemini (mesma mecânica do /captar) e
// auto-publica. Protegido por token (BOT_TOKEN). Disparado pelo GitHub Actions
// (cron) — que vem DESARMADO por padrão (ver .github/workflows/bot.yml).
//
// Uso: POST/GET /api/bot?max=8[&dry=1]  com  Authorization: Bearer <BOT_TOKEN>

import { scrapeOfferRaw, enrichOffer } from "../_lib/scraper.js";
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
import { constantTimeEquals } from "../_lib/auth.js";

const DEFAULT_MAX = 8; // teto de ofertas NOVAS publicadas por execução
const HARD_MAX = 20;
// teto de fetch+extract (fase 1, sem Gemini) por execução — varremos até `max` novas
// OU até este teto, o que vier antes. Bound do limite de subrequests do Workers (~50):
// descoberta (~13) + SCRAPE_BUDGET + Gemini (≤max) fica folgado abaixo de 50.
const SCRAPE_BUDGET = 12;
// títulos que NÃO são de produto (páginas de lista/perfil/recomendações do ML)
const JUNK_TITLE = /minhas listas|recomenda(ç|c)|listas? de\b|^ofertas\b|^mercado livre$/i;

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
  if (!constantTimeEquals(provided, expected)) {
    return jsonResponse({ error: "Token inválido." }, { status: 401 });
  }

  const max = Math.min(
    parseInt(url.searchParams.get("max") || "", 10) || DEFAULT_MAX,
    HARD_MAX
  );
  const dry = url.searchParams.get("dry") === "1";

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
  // dedup BARATO (sem fetch): pula candidato cujo link já é o `link` salvo OU o
  // `sourceUrl` salvo. Os links meli.la são estáveis por oferta, então isso evita
  // re-raspar os populares JÁ no catálogo e libera o orçamento p/ as NOVAS. (dpl do
  // Pelando é efêmero → não casa; esses caem no dedup por mlId pós-scrape.)
  const seen = new Set();
  for (const o of all) {
    if (o.link) seen.add(normalizeLink(o.link));
    if (o.sourceUrl) seen.add(normalizeLink(o.sourceUrl));
  }
  // dedup REAL é por mlId (o link do candidato pode não bater com a URL limpa salva).
  const byMlId = new Map(all.filter((o) => o.mlId).map((o) => [o.mlId, o]));

  const added = [];
  const refreshed = [];
  const errors = [];
  let offers = all;
  let scraped = 0; // teto de fetch+extract por execução (bound de subrequests)
  let hitLimit = false;

  for (const cand of candidates) {
    if (added.length >= max || scraped >= SCRAPE_BUDGET) break;
    const link = cand.url;
    if (seen.has(normalizeLink(link))) continue; // já processado (link ou sourceUrl salvo)

    let base;
    try {
      base = await scrapeOfferRaw(link); // fase 1: barata, sem Gemini
    } catch (err) {
      // bateu no teto de subrequests do Worker → para limpo (não cospe N erros)
      if (/too many subrequests/i.test(err.message || "")) { hitLimit = true; break; }
      errors.push({ link, reason: err.message || "falha no fetch" });
      continue;
    }
    scraped += 1;
    if (!base.raw.title || base.raw.priceCurrent == null) {
      errors.push({ link, reason: "sem título ou preço" });
      continue;
    }
    // Guarda anti-lixo: alguns links resolvem pra página de LISTA/PERFIL do ML (não um
    // produto), com og:title genérico ("Minhas listas de recomendações") e um preço de
    // card qualquer. Não publica.
    if (JUNK_TITLE.test(base.raw.title)) {
      errors.push({ link, reason: "título não-produto (lista/perfil)" });
      continue;
    }
    // dedup por id do produto: já existe e preço igual → pula SEM gastar Gemini.
    const dup = byMlId.get(base.mlId);
    if (dup && Number(dup.priceCurrent || 0) === Number(base.raw.priceCurrent || 0)) continue;

    let scrapedOffer;
    try {
      scrapedOffer = await enrichOffer(base, env); // fase 2: Gemini só p/ novo/mudou
    } catch (err) {
      if (/too many subrequests/i.test(err.message || "")) { hitLimit = true; break; }
      errors.push({ link, reason: err.message || "falha no enrich" });
      continue;
    }
    const slug = uniqueSlug(slugify(scrapedOffer.title || "oferta"), offers.map((o) => o.slug));
    // cupom: prefere o código DIGITÁVEL da fonte (Promobit) ao campaignId do ML
    const coupon = (cand.coupon && cand.coupon.code) ? cand.coupon : scrapedOffer.coupon;
    // ⚠️ COMPLIANCE: NUNCA salvar `link` (o meli.la da FONTE tem a tag do concorrente).
    // Grava URL LIMPA + `sourceUrl`; o relink.yml monetiza quando a EC2 estiver ligada.
    const candidate = ensureOffer({ ...scrapedOffer, slug, link: scrapedOffer.productUrl, coupon, seller: "Mercado Livre" });
    const r = upsertOffer(offers, candidate, { onlyIfChanged: true, bumpToTop: true });
    offers = r.offers;
    byMlId.set(candidate.mlId, r.offer); // não reprocessa o mesmo produto neste run
    const info = { slug: r.offer.slug, title: r.offer.title, price: r.offer.priceCurrent };
    if (r.action === "added") added.push(info);
    else if (r.action === "refreshed") refreshed.push(info);
  }

  if (!dry && (added.length || refreshed.length)) {
    await saveOffers(env, offers);
  }

  return jsonResponse({
    ok: true,
    source: "promotop+pechinchou+pelando+promobit",
    candidates: candidates.length,
    scraped,
    hitLimit,
    added: added.length,
    refreshed: refreshed.length,
    dry,
    items: added,
    refreshedItems: refreshed,
    errors
  });
}
