// TEMPORÁRIO: testa se o edge alcança a API por hostname. Remover depois.
import { jsonResponse } from "../_lib/render.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const base = (url.searchParams.get("base") || env.AFFILIATE_API_URL || "http://56.125.37.155:8000").replace(/\/+$/, "");
  try {
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(8000) });
    return jsonResponse({ ok: true, base, reachable: true, status: r.status, body: (await r.text()).slice(0, 160) });
  } catch (e) {
    return jsonResponse({ ok: true, base, reachable: false, error: String((e && e.message) || e) });
  }
}
