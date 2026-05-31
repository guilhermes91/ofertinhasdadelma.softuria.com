// Migração/refresh dos campos DERIVADOS das ofertas já gravadas no KV. Token-gated
// (igual /api/bot). NÃO re-scrapeia (sem rede, sem Gemini) — só re-roda ensureOffer:
//  - zera `bestseller` stale (o scraper antigo dava falso-positivo em ~todas; o flag
//    correto volta sozinho conforme o bot re-captura com a detecção corrigida);
//  - re-deriva `store` + `model` (hashtags de descoberta) nas ofertas antigas;
//  - normaliza `coupon`.
// Idempotente e seguro. Uso: POST/GET /api/refresh[?dry=1]  Authorization: Bearer <BOT_TOKEN>

import { loadOffers, saveOffers, ensureOffer } from "../_lib/data.js";
import { jsonResponse } from "../_lib/render.js";
import { constantTimeEquals } from "../_lib/auth.js";

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

  const dry = url.searchParams.get("dry") === "1";
  const all = await loadOffers(env);
  let changed = 0;
  let clearedBestseller = 0;
  let gotModel = 0;
  const next = all.map((o) => {
    const before = JSON.stringify([o.bestseller, o.store, o.model, o.coupon]);
    // zera o bestseller stale; ensureOffer re-deriva store/model e normaliza coupon
    const r = ensureOffer({ ...o, bestseller: false });
    if (o.bestseller && !r.bestseller) clearedBestseller++;
    if (!o.model && r.model) gotModel++;
    if (JSON.stringify([r.bestseller, r.store, r.model, r.coupon]) !== before) changed++;
    return r;
  });
  if (!dry && changed) await saveOffers(env, next);
  return jsonResponse({ ok: true, total: all.length, changed, clearedBestseller, gotModel, dry });
}
