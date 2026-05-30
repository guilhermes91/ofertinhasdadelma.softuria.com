// Monetização + compliance dos links de afiliado. Token-gated (igual /api/bot).
//
// A GERAÇÃO do link é da API externa (gerador-link-afiliados) e roda no GitHub
// Actions (workflow relink.yml) — o edge não alcança a API (porta 8000 / EC2 sob
// demanda). Este endpoint só LISTA o que falta e APLICA o que o GHA gerou:
//
//   GET  /api/relink?list=1     → { candidates: [{ id, slug, mlId, productUrl }] }
//        (ofertas com mlId cujo link NÃO é um link de afiliado nosso)
//   POST /api/relink {updates:[{id,link}]} → grava os links gerados. { updated }
//   POST /api/relink            → varredura de COMPLIANCE: resolve cada link e, se
//        for de terceiro, troca pela URL de produto LIMPA (não depende da API).
//
// Uso: Authorization: Bearer <BOT_TOKEN>

import { loadOffers, saveOffers, mlIdFromUrl } from "../_lib/data.js";
import { jsonResponse } from "../_lib/render.js";

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
  return `https://produto.mercadolivre.com.br/${mlId.replace("MLB", "MLB-")}`;
}

// É um link de afiliado nosso? (meli.la curto que geramos, ou /social/<nossa tag>)
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
  if (provided !== expected) return jsonResponse({ error: "Token inválido." }, { status: 401 });

  const tag = env.ML_AFFILIATE_TAG || OUR_TAG_DEFAULT;
  const offers = await loadOffers(env);

  // --- LISTAR candidatos p/ o GHA gerar (sem rede) ---
  if (method === "GET" && url.searchParams.get("list") === "1") {
    const candidates = offers
      .filter((o) => o.mlId && !isOurAffiliateLink(o.link, tag))
      .map((o) => ({ id: o.id, slug: o.slug, mlId: o.mlId, productUrl: productUrlFromId(o.mlId) }));
    return jsonResponse({ ok: true, total: offers.length, candidates });
  }

  // --- APLICAR links gerados pelo GHA ---
  let body = null;
  if (method === "POST") {
    try { body = await request.json(); } catch { body = null; }
  }
  if (body && Array.isArray(body.updates)) {
    const byId = new Map(offers.map((o) => [o.id, o]));
    let updated = 0;
    for (const u of body.updates) {
      const o = u && u.id ? byId.get(u.id) : null;
      const link = u && typeof u.link === "string" ? u.link.trim() : "";
      // só aceita link de afiliado nosso (segurança: nunca grava link de terceiro aqui)
      if (o && isOurAffiliateLink(link, tag) && link !== o.link) {
        o.link = link;
        updated++;
      }
    }
    if (updated) await saveOffers(env, offers);
    return jsonResponse({ ok: true, updated, received: body.updates.length });
  }

  // --- VARREDURA DE COMPLIANCE (sem API): foreign → URL limpa ---
  const max = parseInt(url.searchParams.get("max") || "", 10) || 0;
  const dry = url.searchParams.get("dry") === "1";
  const cleaned = [];
  const skipped = [];
  let safe = 0;
  let processed = 0;
  for (const o of offers) {
    if (max && processed >= max) break;
    processed++;
    const finalUrl = await resolveFinal(o.link);
    if (!isForeign(finalUrl, tag)) { safe++; continue; }
    const mlId = o.mlId || mlIdFromUrl(finalUrl) || mlIdFromUrl(o.link);
    if (!mlId) { skipped.push({ slug: o.slug, link: o.link }); continue; }
    const clean = productUrlFromId(mlId);
    if (clean !== o.link) { if (!dry) o.link = clean; cleaned.push({ slug: o.slug, from: o.link, to: clean }); }
  }
  if (!dry && cleaned.length) await saveOffers(env, offers);
  return jsonResponse({ ok: true, mode: "compliance-sweep", dry, total: offers.length, processed, safe, cleaned: cleaned.length, skipped: skipped.length, cleanedItems: cleaned, skippedItems: skipped });
}
