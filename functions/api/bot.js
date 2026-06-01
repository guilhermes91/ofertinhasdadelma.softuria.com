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
import { generateAffiliate } from "../_lib/affiliate.js";

const DEFAULT_MAX = 8; // teto de ofertas NOVAS publicadas por execução
const HARD_MAX = 20;
// teto de fetch+extract (fase 1, sem Gemini) por execução — varremos até `max` novas
// OU até este teto, o que vier antes. Bound do limite de subrequests do Workers (~50):
// descoberta (~14) + SCRAPE_BUDGET×~2 + Gemini (≤max) + geração inline (≤added) precisa
// caber abaixo de 50. Por isso 8 (não 10): a captura agora MONETIZA na hora (+1 subreq por
// oferta nova), e a cron confiável de 10min do Worker roda mais vezes — cada run faz menos.
const SCRAPE_BUDGET = 8;
// Lock advisório no KV: a cron de 10min do Worker pode sobrepor um run que travou —
// saveOffers é read-modify-write sem CAS na chave única offers:all. TTL curto (cobre 1 run
// ~1-2min e ainda libera bem antes da próxima cron). Auto-cura em exceção (não-deletado).
const LOCK_KEY = "bot:lock";
const LOCK_TTL_S = 240;
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

  // Lock: se outro run está em curso, pula (não corrompe o KV com last-write-wins).
  if (!dry) {
    const held = await env.OFFERS_KV.get(LOCK_KEY);
    if (held) {
      return jsonResponse({ ok: true, skipped: "lock", lockedSince: held });
    }
    await env.OFFERS_KV.put(LOCK_KEY, String(Date.now()), { expirationTtl: LOCK_TTL_S });
  }
  const releaseLock = async () => { if (!dry) await env.OFFERS_KV.delete(LOCK_KEY); };

  let candidates = [];
  try {
    candidates = await discoverMlOffers();
  } catch (err) {
    await releaseLock();
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

  // CORREÇÃO barata (sem scrape): fontes com PREÇO/CUPOM estruturado (pechinchou,
  // promobit) são autoritativas pro deal. Casa o candidato com a oferta já gravada por
  // sourceUrl e corrige preço/cupom in-place — sem gastar fetch/Gemini.
  let corrected = 0;
  const bySource = new Map();
  for (const o of all) if (o.sourceUrl) bySource.set(normalizeLink(o.sourceUrl), o);
  for (const c of candidates) {
    if (c.price == null) continue;
    const o = bySource.get(normalizeLink(c.url));
    if (!o) continue;
    const newPrice = Number(c.price);
    if (!(newPrice > 0)) continue;
    const newOld = c.priceOld != null && Number(c.priceOld) > newPrice ? Number(c.priceOld) : o.priceOld || null;
    const newCoupon = c.coupon && c.coupon.code ? c.coupon : o.coupon || null;
    const priceChanged = Number(o.priceCurrent || 0) !== newPrice;
    const couponChanged = JSON.stringify(o.coupon || null) !== JSON.stringify(newCoupon || null);
    if (!priceChanged && !couponChanged) continue;
    const idx = offers.findIndex((x) => x.id === o.id);
    if (idx === -1) continue;
    offers[idx] = ensureOffer({ ...o, priceCurrent: newPrice, priceOld: newOld, discount: null, coupon: newCoupon });
    corrected += 1;
  }
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
    // Preço da FONTE é autoritativo pro deal (pechinchou/promobit/promotop/pelando têm o
    // preço curado + cupom). Aplica ANTES do guard — a fonte pode ter preço que o card do
    // ML não mostra (ex.: link de catálogo /p/ vem sem preço server-side). O ML serve
    // imagem/mlId/link. Corrige o "preço errado do card /social".
    if (cand.price != null && Number(cand.price) > 0) {
      base.raw.priceCurrent = Number(cand.price);
      base.raw.priceOld = cand.priceOld != null && Number(cand.priceOld) > base.raw.priceCurrent ? Number(cand.priceOld) : base.raw.priceOld;
      base.raw.discount = null;
    }
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
    // MONETIZAÇÃO INLINE: gera o NOSSO link de afiliado NA HORA (a API é sempre on). Seed =
    // finalUrl (/social resolvido — forma que o relink prova ser aceita) ou sourceUrl (meli.la).
    // Degrada SEGURO: API fora/rejeita → null → URL de produto LIMPA (a oferta esconde via
    // hasOurLink e o relink.yml horário/manual monetiza depois). +1 subreq por oferta nova.
    // ⚠️ COMPLIANCE: NUNCA salvar o link da FONTE (tem a tag do concorrente); fallback = limpo.
    const ourLink = await generateAffiliate(base.finalUrl || scrapedOffer.sourceUrl, env);
    const candidate = ensureOffer({ ...scrapedOffer, slug, link: ourLink || scrapedOffer.productUrl, coupon, seller: "Mercado Livre" });
    const r = upsertOffer(offers, candidate, { onlyIfChanged: true, bumpToTop: true });
    offers = r.offers;
    byMlId.set(candidate.mlId, r.offer); // não reprocessa o mesmo produto neste run
    const info = { slug: r.offer.slug, title: r.offer.title, price: r.offer.priceCurrent };
    if (r.action === "added") added.push(info);
    else if (r.action === "refreshed") refreshed.push(info);
  }

  if (!dry && (added.length || refreshed.length || corrected)) {
    await saveOffers(env, offers);
  }

  await releaseLock();

  return jsonResponse({
    ok: true,
    source: "promotop+pechinchou+pelando+promobit",
    candidates: candidates.length,
    scraped,
    hitLimit,
    corrected,
    added: added.length,
    refreshed: refreshed.length,
    dry,
    items: added,
    refreshedItems: refreshed,
    errors
  });
}
