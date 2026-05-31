// TEMPORÁRIO: testa se o edge do Cloudflare alcança a API externa. Remover depois.
import { jsonResponse } from "../_lib/render.js";

export async function onRequestGet({ env }) {
  const base = (env.AFFILIATE_API_URL || "http://56.125.37.155:8000").replace(/\/+$/, "");
  const out = {};
  for (const u of [`${base}/health`]) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
      out[u] = { reachable: true, status: r.status, body: (await r.text()).slice(0, 160) };
    } catch (e) {
      out[u] = { reachable: false, error: String((e && e.message) || e) };
    }
  }
  return jsonResponse({ ok: true, base, result: out });
}
