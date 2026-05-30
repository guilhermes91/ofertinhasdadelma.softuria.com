// Varredura de COMPLIANCE: garante que NENHUMA oferta no catálogo aponte pra um
// link de afiliado de terceiro (ex.: meli.la → /social/promotop). Resolve o link
// de cada oferta; se NÃO for nosso (tag própria) nem uma URL limpa sem tag,
// regenera o NOSSO link de afiliado a partir do mlId — e, se a geração falhar,
// troca pela URL de produto LIMPA (jamais mantém o link do concorrente).
//
// Token-gated igual ao /api/bot. Uso: POST/GET /api/relink[?dry=1][&max=N]
//   Authorization: Bearer <BOT_TOKEN>

import { loadOffers, saveOffers, mlIdFromUrl } from "../_lib/data.js";
import { jsonResponse } from "../_lib/render.js";
import { generateAffiliate } from "../_lib/affiliate.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function onRequestPost(context) {
  return run(context);
}
export async function onRequestGet(context) {
  return run(context);
}

function productUrlFromId(mlId) {
  return `https://produto.mercadolivre.com.br/${mlId.replace("MLB", "MLB-")}`;
}

// Resolve o link (segue redirects) e devolve a URL final.
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

// É nosso (tag própria) OU uma URL de produto limpa sem tag de ninguém?
function isSafe(finalUrl, tag) {
  const u = (finalUrl || "").toLowerCase();
  if (!u) return false;
  const t = tag.toLowerCase();
  if (u.includes("/social/" + t) || u.includes("matt_word=" + t)) return true; // nosso
  // URL de produto sem nenhuma tag de afiliado → não credita concorrente (seguro).
  const hasForeignTag = u.includes("/social/") || u.includes("matt_word=") || u.includes("matt_tool=");
  return !hasForeignTag;
}

async function run(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const expected = env.BOT_TOKEN || (await env.OFFERS_KV.get("bot:token"));
  if (!expected) return jsonResponse({ error: "BOT_TOKEN não configurado." }, { status: 503 });
  const provided =
    (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token") ||
    "";
  if (provided !== expected) return jsonResponse({ error: "Token inválido." }, { status: 401 });

  const dry = url.searchParams.get("dry") === "1";
  const max = parseInt(url.searchParams.get("max") || "", 10) || 0; // 0 = todas
  const tag = env.ML_AFFILIATE_TAG || "sade9179546";

  const offers = await loadOffers(env);
  const relinked = [];
  const cleaned = [];
  const skipped = [];
  let oursOk = 0;
  let processed = 0;

  for (const o of offers) {
    if (max && processed >= max) break;
    processed++;

    const finalUrl = await resolveFinal(o.link);
    if (isSafe(finalUrl, tag)) { oursOk++; continue; }

    // Link de terceiro detectado → tenta regenerar o NOSSO.
    const mlId = o.mlId || mlIdFromUrl(finalUrl) || mlIdFromUrl(o.link);
    if (!mlId) { skipped.push({ slug: o.slug, link: o.link, finalUrl, reason: "sem mlId" }); continue; }

    const productUrl = productUrlFromId(mlId);
    const aff = await generateAffiliate(productUrl, env);
    const newLink = aff || productUrl; // nosso link OU url limpa — nunca o do concorrente
    if (newLink && newLink !== o.link) {
      if (!dry) o.link = newLink;
      (aff ? relinked : cleaned).push({ slug: o.slug, from: o.link, to: newLink });
    }
  }

  if (!dry && (relinked.length || cleaned.length)) await saveOffers(env, offers);

  return jsonResponse({
    ok: true,
    dry,
    total: offers.length,
    processed,
    oursOk,
    relinked: relinked.length,
    cleaned: cleaned.length,
    skipped: skipped.length,
    relinkedItems: relinked,
    cleanedItems: cleaned,
    skippedItems: skipped
  });
}
