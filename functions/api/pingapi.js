// TEMPORÁRIO: testa se o edge alcança a API por hostname. Remover depois.
import { jsonResponse } from "../_lib/render.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const base = (url.searchParams.get("base") || env.AFFILIATE_API_URL || "http://oj0d367pnr.softuria.com:8000").replace(/\/+$/, "");
  const gen = url.searchParams.get("gen");
  try {
    if (gen) {
      const r = await fetch(`${base}/v2/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: gen }),
        signal: AbortSignal.timeout(12000)
      });
      const d = await r.json();
      return jsonResponse({ ok: true, base, status: r.status, short_url: d.short_url || d.affiliate_url || null, err: d.error || null });
    }
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(8000) });
    return jsonResponse({ ok: true, base, reachable: true, status: r.status, body: (await r.text()).slice(0, 160) });
  } catch (e) {
    return jsonResponse({ ok: true, base, reachable: false, error: String((e && e.message) || e) });
  }
}
