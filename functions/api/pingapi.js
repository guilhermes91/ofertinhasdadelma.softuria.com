// TEMPORÁRIO: confirma que a env AFFILIATE_API_URL está setada e que o edge gera.
// Não contém hostname (lê do env). Remover depois.
import { jsonResponse } from "../_lib/render.js";

export async function onRequestGet({ request, env }) {
  const base = (env.AFFILIATE_API_URL || "").replace(/\/+$/, "");
  if (!base) return jsonResponse({ ok: true, configured: false });
  const gen = new URL(request.url).searchParams.get("gen");
  try {
    if (gen) {
      const r = await fetch(`${base}/v2/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: gen }), signal: AbortSignal.timeout(12000)
      });
      const d = await r.json();
      return jsonResponse({ ok: true, configured: true, status: r.status, short_url: d.short_url || d.affiliate_url || null });
    }
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(8000) });
    return jsonResponse({ ok: true, configured: true, reachable: true, status: r.status });
  } catch (e) {
    return jsonResponse({ ok: true, configured: true, reachable: false, error: String((e && e.message) || e) });
  }
}
