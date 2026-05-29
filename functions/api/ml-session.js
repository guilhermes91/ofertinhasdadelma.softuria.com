// Guarda a sessão (cookies) do afiliado Mercado Livre p/ o fluxo /v2 gerar nosso link.
// POST exige Basic Auth (admin, via _middleware). Como obter o cookie: no navegador
// logado no painel de afiliados, F12 > Network > qualquer request > Request Headers >
// copie o valor inteiro de "cookie" e mande no body { "cookies": "<valor>" }.

import { jsonResponse } from "../_lib/render.js";
import { ML_SESSION_KEY } from "../_lib/affiliate.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: "JSON inválido." }, { status: 400 }); }
  const cookies = String((body && body.cookies) || "").trim().split(/\s+/).join(" ");
  if (!cookies.includes("=")) {
    return jsonResponse({ error: "Cookie inválido (esperado 'k1=v1; k2=v2; ...')." }, { status: 400 });
  }
  await env.OFFERS_KV.put(ML_SESSION_KEY, cookies);
  return jsonResponse({ ok: true, size: cookies.length, hasCsrf: /(?:^|;\s*)_csrf=/.test(cookies) });
}

export async function onRequestGet(context) {
  const c = await context.env.OFFERS_KV.get(ML_SESSION_KEY);
  return jsonResponse({ exists: !!c, size: c ? c.length : 0, hasCsrf: !!(c && /(?:^|;\s*)_csrf=/.test(c)) });
}
