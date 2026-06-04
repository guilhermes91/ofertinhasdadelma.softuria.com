// Espelha as imagens das ofertas pro R2 (hospedagem própria) — roda FORA do bot, em cron
// própria, pra não pesar no orçamento de subrequests da captura. Idempotente: pula imagem
// que já é nossa (/img/). Backfill das existentes acontece naturalmente (N por run). Reescreve
// offer.image pra URL do nosso domínio SÓ depois de gravar no R2 (put antes de reescrever).
// Token-gated (BOT_TOKEN), isento no _middleware. Compartilha o bot:lock (offers:all é chave
// única, read-modify-write sem CAS).
import { loadOffers, saveOffers, mirrorKey, isHostedImage } from "../_lib/data.js";
import { jsonResponse, SITE } from "../_lib/render.js";
import { constantTimeEquals } from "../_lib/auth.js";

const DEFAULT_MAX = 12; // imagens espelhadas por run (cabe folgado no orçamento de subreq)
const HARD_MAX = 40;
const LOCK_KEY = "bot:lock";
const LOCK_TTL_S = 240;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const onRequestPost = (c) => run(c);
export const onRequestGet = (c) => run(c);

async function run(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const expected = env.BOT_TOKEN || (await env.OFFERS_KV.get("bot:token"));
  if (!expected) return jsonResponse({ error: "BOT_TOKEN não configurado." }, { status: 503 });
  const provided =
    (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token") ||
    "";
  if (!constantTimeEquals(provided, expected)) return jsonResponse({ error: "Token inválido." }, { status: 401 });
  if (!env.IMG_BUCKET) return jsonResponse({ error: "IMG_BUCKET (R2) não bindado." }, { status: 503 });

  const max = Math.min(parseInt(url.searchParams.get("max") || "", 10) || DEFAULT_MAX, HARD_MAX);
  const dry = url.searchParams.get("dry") === "1";

  if (!dry) {
    const held = await env.OFFERS_KV.get(LOCK_KEY);
    if (held) return jsonResponse({ ok: true, skipped: "lock", lockedSince: held });
    await env.OFFERS_KV.put(LOCK_KEY, String(Date.now()), { expirationTtl: LOCK_TTL_S });
  }
  const release = async () => { if (!dry) await env.OFFERS_KV.delete(LOCK_KEY); };

  try {
    const offers = await loadOffers(env);
    const mirrored = [];
    const errors = [];
    let changed = false;

    for (const o of offers) {
      if (mirrored.length >= max) break;
      const src = o.image;
      if (!src) continue;

      // Migração de path: imagem hospedada no path ANTIGO /img/ml|shopee/<hash> → move pro path
      // ÚNICO /img/<hash> (copia o objeto no R2; o hash é o mesmo, só tira o prefixo de loja).
      if (/\/img\/(?:ml|shopee)\//.test(src)) {
        const oldKey = src.slice(src.indexOf("/img/") + 5); // "ml/<hash>.ext"
        const newKey = oldKey.replace(/^(?:ml|shopee)\//, ""); // "<hash>.ext"
        try {
          const obj = await env.IMG_BUCKET.get(oldKey);
          if (!obj) { errors.push({ slug: o.slug, reason: "objeto antigo ausente no R2" }); continue; }
          await env.IMG_BUCKET.put(newKey, obj.body, { httpMetadata: obj.httpMetadata });
          if (!dry) { o.image = `${SITE.origin}/img/${newKey}`; changed = true; }
          mirrored.push({ slug: o.slug, key: newKey, reKeyed: true });
        } catch (err) {
          errors.push({ slug: o.slug, reason: err.message || "falha re-key" });
        }
        continue;
      }

      // já hospedada (path único) ou não-http → pula
      if (isHostedImage(src) || !/^https?:\/\//i.test(src)) continue;
      try {
        const r = await fetch(src, { headers: { "User-Agent": UA }, cf: { cacheTtl: 3600 } });
        const ct = r.headers.get("content-type") || "";
        if (!r.ok || !ct.startsWith("image/")) {
          errors.push({ slug: o.slug, reason: `fonte ${r.status} ${ct || "?"}` });
          continue;
        }
        const key = await mirrorKey(src, ct);
        // put ANTES de reescrever: garante que /img/<key> existe quando a oferta apontar pra ela
        await env.IMG_BUCKET.put(key, r.body, { httpMetadata: { contentType: ct } });
        if (!dry) {
          o.image = `${SITE.origin}/img/${key}`;
          changed = true;
        }
        mirrored.push({ slug: o.slug, key });
      } catch (err) {
        errors.push({ slug: o.slug, reason: err.message || "falha" });
      }
    }

    if (changed && !dry) await saveOffers(env, offers);
    return jsonResponse({ ok: true, dry, scanned: offers.length, mirrored: mirrored.length, items: mirrored, errors });
  } finally {
    await release();
  }
}
