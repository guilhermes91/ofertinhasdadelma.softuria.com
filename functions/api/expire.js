// Limpa ofertas quebradas (muitos reports) e, opcionalmente, vencidas (?days=N).
// Admin-only (POST passa pelo Basic Auth do _middleware). Aciona pelo botão do admin.
import { loadOffers, saveOffers, expireOffers } from "../_lib/data.js";
import { jsonResponse } from "../_lib/render.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const daysParam = url.searchParams.get("days");
  const maxAgeDays = daysParam ? parseInt(daysParam, 10) || null : null; // sem days = só quebradas
  const all = await loadOffers(env);
  const { kept, removed } = expireOffers(all, { maxAgeDays, minReports: 3 });
  if (removed.length) await saveOffers(env, kept);
  return jsonResponse({ ok: true, removed: removed.length, kept: kept.length, items: removed });
}
