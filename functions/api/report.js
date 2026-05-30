// "Reportar oferta quebrada": público (exempto do Basic Auth no _middleware).
// Rate-limit por IP+oferta/dia. Ao atingir o limite de avisos, a oferta sai do ar.
import { loadOffers, saveOffers } from "../_lib/data.js";
import { jsonResponse } from "../_lib/render.js";

const THRESHOLD = 3;

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: "JSON inválido." }, { status: 400 }); }
  const id = String((body && body.id) || "").trim();
  if (!id) return jsonResponse({ error: "Faltou o id." }, { status: 400 });

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rk = `report:${ip}:${id}`;
  if (await env.OFFERS_KV.get(rk)) {
    return jsonResponse({ ok: true, message: "Já registramos seu aviso. Valeu!" });
  }

  const all = await loadOffers(env);
  const idx = all.findIndex((o) => o.id === id);
  if (idx === -1) return jsonResponse({ ok: true, message: "Essa oferta já saiu do ar." });

  all[idx].reports = (all[idx].reports || 0) + 1;
  let removed = false;
  let next = all;
  if (all[idx].reports >= THRESHOLD) {
    next = all.filter((_, i) => i !== idx);
    removed = true;
  }
  await saveOffers(env, next);
  await env.OFFERS_KV.put(rk, "1", { expirationTtl: 86400 });
  return jsonResponse({ ok: true, removed, message: removed ? "Tirada do ar — obrigado!" : "Obrigado pelo aviso!" });
}
