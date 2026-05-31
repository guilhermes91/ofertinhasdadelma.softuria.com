// Monetização + compliance dos links de afiliado. Token-gated (igual /api/bot).
//
// A GERAÇÃO roda no GitHub Actions (relink.yml): pega o link da FONTE (sourceUrl, o
// meli.la) de cada oferta e manda pra API externa, que resolve o produto e devolve o
// NOSSO link. O edge não alcança a API (porta 8000 / EC2 sob demanda).
//
//   GET  /api/relink?list=1   → { candidates: [{ id, slug, mlId, genUrl }] }
//        genUrl = sourceUrl (preferido) || produto.mercadolivre.com.br/MLB-<mlId>
//        (só ofertas cujo link ainda NÃO é nosso)
//   POST {seed:[{mlId, sourceUrl}]}   → grava sourceUrl em ofertas existentes (backfill)
//   POST {updates:[{id?|mlId?, link}]} → grava os links gerados (só aceita link nosso)
//   POST (sem corpo)          → varredura de COMPLIANCE: foreign → URL limpa
//
// Uso: Authorization: Bearer <BOT_TOKEN>

import { loadOffers, saveOffers, mlIdFromUrl } from "../_lib/data.js";
import { jsonResponse } from "../_lib/render.js";
import { constantTimeEquals } from "../_lib/auth.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const OUR_TAG_DEFAULT = "sade9179546";

export async function onRequestGet(context) {
  return run(context, "GET");
}
export async function onRequestPost(context) {
  return run(context, "POST");
}

function productUrlFromId(mlId) {
  return mlId ? `https://produto.mercadolivre.com.br/${mlId.replace("MLB", "MLB-")}` : "";
}

function isOurAffiliateLink(link, tag) {
  const l = String(link || "").toLowerCase();
  return /(?:^|\/\/)meli\.la\//.test(l) || l.includes("/social/" + tag.toLowerCase());
}

async function resolveFinal(link) {
  try {
    const r = await fetch(link, {
      redirect: "follow",
      headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9", Accept: "text/html,*/*;q=0.8" }
    });
    return r.url || "";
  } catch {
    return "";
  }
}
function isForeign(finalUrl, tag) {
  const u = (finalUrl || "").toLowerCase();
  if (!u) return false;
  if (u.includes("/social/" + tag.toLowerCase()) || u.includes("matt_word=" + tag.toLowerCase())) return false;
  return u.includes("/social/") || u.includes("matt_word=") || u.includes("matt_tool=");
}

async function run(context, method) {
  const { request, env } = context;
  const url = new URL(request.url);

  const expected = env.BOT_TOKEN || (await env.OFFERS_KV.get("bot:token"));
  if (!expected) return jsonResponse({ error: "BOT_TOKEN não configurado." }, { status: 503 });
  const provided =
    (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token") ||
    "";
  if (!constantTimeEquals(provided, expected)) return jsonResponse({ error: "Token inválido." }, { status: 401 });

  const tag = env.ML_AFFILIATE_TAG || OUR_TAG_DEFAULT;
  const offers = await loadOffers(env);

  // --- LISTAR candidatos p/ o GHA gerar ---
  if (method === "GET" && url.searchParams.get("list") === "1") {
    const candidates = offers
      .filter((o) => !isOurAffiliateLink(o.link, tag))
      .map((o) => ({ id: o.id, slug: o.slug, mlId: o.mlId, genUrl: o.sourceUrl || productUrlFromId(o.mlId) }))
      .filter((c) => c.genUrl);
    return jsonResponse({ ok: true, total: offers.length, candidates });
  }

  let body = null;
  if (method === "POST") {
    try { body = await request.json(); } catch { body = null; }
  }

  // --- SEED de sourceUrl (backfill de ofertas antigas, casa por mlId) ---
  if (body && Array.isArray(body.seed)) {
    let seeded = 0;
    for (const s of body.seed) {
      const mlId = s && s.mlId ? String(s.mlId).toUpperCase() : "";
      const src = s && typeof s.sourceUrl === "string" ? s.sourceUrl.trim() : "";
      if (!mlId || !/^https?:\/\//i.test(src)) continue;
      for (const o of offers) {
        if (String(o.mlId).toUpperCase() === mlId && o.sourceUrl !== src) { o.sourceUrl = src; seeded++; }
      }
    }
    if (seeded) await saveOffers(env, offers);
    return jsonResponse({ ok: true, seeded });
  }

  // --- APLICAR links gerados (casa por id OU mlId; só aceita link nosso) ---
  if (body && Array.isArray(body.updates)) {
    let updated = 0;
    for (const u of body.updates) {
      const link = u && typeof u.link === "string" ? u.link.trim() : "";
      if (!isOurAffiliateLink(link, tag)) continue;
      const targets = offers.filter(
        (o) => (u.id && o.id === u.id) || (u.mlId && String(o.mlId).toUpperCase() === String(u.mlId).toUpperCase())
      );
      for (const o of targets) {
        if (o.link !== link) { o.link = link; updated++; }
      }
    }
    if (updated) await saveOffers(env, offers);
    return jsonResponse({ ok: true, updated, received: body.updates.length });
  }

  // --- VARREDURA DE COMPLIANCE (sem API): foreign → URL limpa ---
  const dry = url.searchParams.get("dry") === "1";
  const cleaned = [];
  const skipped = [];
  let safe = 0;
  for (const o of offers) {
    const finalUrl = await resolveFinal(o.link);
    if (!isForeign(finalUrl, tag)) { safe++; continue; }
    const mlId = o.mlId || mlIdFromUrl(finalUrl) || mlIdFromUrl(o.link);
    const clean = productUrlFromId(mlId);
    if (!clean) { skipped.push({ slug: o.slug, link: o.link }); continue; }
    if (clean !== o.link) { if (!dry) o.link = clean; cleaned.push({ slug: o.slug, from: o.link, to: clean }); }
  }
  if (!dry && cleaned.length) await saveOffers(env, offers);
  return jsonResponse({ ok: true, mode: "compliance-sweep", dry, total: offers.length, safe, cleaned: cleaned.length, skipped: skipped.length, cleanedItems: cleaned, skippedItems: skipped });
}
