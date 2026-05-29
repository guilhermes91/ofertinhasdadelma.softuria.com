// Geração de link de afiliado — porte do "gerador-link-afiliados" pra nossa stack
// (edge JS, sem browser). Shopee = pura URL. Mercado Livre = fluxo /v2 (1 POST com
// cookie de sessão + x-csrf-token). Compliant: gera o NOSSO link oficial (não é
// rotação/cloaking). Degrada com segurança: sem config/sessão → retorna null.

const BASE = "https://www.mercadolivre.com.br";
const LINKS_API = "/affiliate-program/api/v2/affiliates/createLink";
const LINKBUILDER = "/afiliados/linkbuilder";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const H = {
  "User-Agent": UA,
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "sec-ch-ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"'
};
const ML_SESSION_KEY = "ml:session";

// ---------------- Shopee (pura) ----------------
export function isShopeeUrl(url) {
  try { return /shopee/i.test(new URL(url).hostname); } catch { return false; }
}
function cleanUrl(u) {
  try { const p = new URL(u); return `${p.protocol}//${p.host}${p.pathname}`; } catch { return u; }
}
export function shopeeAffiliateUrl(url, affiliateId, subId = "----") {
  const clean = encodeURIComponent(cleanUrl(url));
  return `https://s.shopee.com.br/an_redir?origin_link=${clean}&affiliate_id=${encodeURIComponent(affiliateId)}&sub_id=${encodeURIComponent(subId)}`;
}

// ---------------- cookies ----------------
export function parseCookieStr(s) {
  const o = {};
  for (const part of String(s || "").split(";")) {
    const p = part.trim();
    const i = p.indexOf("=");
    if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  return o;
}
export function dictToCookieStr(d) {
  return Object.entries(d).map(([k, v]) => `${k}=${v}`).join("; ");
}
export function mergeSetCookies(oldStr, res) {
  const merged = parseCookieStr(oldStr);
  let list = [];
  try { list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : []; } catch { /* noop */ }
  if (!list.length) { const sc = res.headers.get("set-cookie"); if (sc) list = [sc]; }
  for (const sc of list) {
    const part = sc.split(";", 1)[0];
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!v || v.toLowerCase() === "deleted") delete merged[k];
    else merged[k] = v;
  }
  return dictToCookieStr(merged);
}
function csrfFromCookie(s) { return parseCookieStr(s)._csrf || null; }
function csrfFromHtml(html) {
  const m = String(html || "").match(/"csrfToken"\s*:\s*"([^"]+)"/) || String(html || "").match(/"csrf"\s*:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

export function isMlUrl(url) {
  try { return /(?:^|\.)mercadolivre\.com(\.br)?$|(?:^|\.)meli\.la$/i.test(new URL(url).hostname); } catch { return false; }
}

// GET /afiliados/linkbuilder pra rotacionar cookies e manter sessão viva.
export async function mlKeepalive(cookieStr) {
  const r = await fetch(BASE + LINKBUILDER, {
    headers: { ...H, Accept: "text/html,application/xhtml+xml,*/*;q=0.8", Cookie: cookieStr, Referer: BASE + "/" },
    redirect: "manual"
  });
  if ([301, 302, 303, 307, 308].includes(r.status)) {
    const loc = r.headers.get("location") || "";
    if (/login/i.test(loc)) return { ok: false, reason: "sessão expirou" };
  }
  if (r.status !== 200) return { ok: false, status: r.status };
  return { ok: true, cookies: mergeSetCookies(cookieStr, r) };
}

// Gera 1 link de afiliado ML (fluxo /v2). Retorna { link, cookies, raw } ou { error, cookies }.
export async function mlAffiliateLink(productUrl, tag, cookieStr) {
  let cookies = cookieStr;
  let csrf = csrfFromCookie(cookies);
  if (!csrf) {
    const g = await fetch(BASE + LINKBUILDER, {
      headers: { ...H, Accept: "text/html,*/*;q=0.8", Cookie: cookies, Referer: BASE + "/" },
      redirect: "manual"
    });
    cookies = mergeSetCookies(cookies, g);
    csrf = csrfFromCookie(cookies) || csrfFromHtml(await g.text());
    if (!csrf) return { error: "csrf", cookies };
  }
  const r = await fetch(BASE + LINKS_API, {
    method: "POST",
    headers: {
      ...H,
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      Cookie: cookies,
      "x-csrf-token": csrf,
      Referer: BASE + LINKBUILDER,
      Origin: BASE
    },
    // endpoint real: createLink, body com urls[] + tag (validado no browser).
    body: JSON.stringify({ urls: [productUrl], tag })
  });
  cookies = mergeSetCookies(cookies, r);
  if (r.status !== 200) return { error: r.status, detail: (await r.text()).slice(0, 200), cookies };
  let data;
  try { data = await r.json(); } catch { return { error: "json", cookies }; }
  return { link: extractAffiliateLink(data), raw: data, cookies };
}

// Extrai o link de afiliado da resposta do createLink (shape pode variar).
function extractAffiliateLink(d) {
  if (!d) return null;
  const arr = d.links || d.urls || d.data || (Array.isArray(d) ? d : null);
  if (Array.isArray(arr) && arr.length) {
    const f = arr[0];
    if (typeof f === "string") return f;
    return f.short_url || f.shortUrl || f.url || f.link || null;
  }
  const v = d.short_url || d.shortUrl || d.url || d.link;
  return typeof v === "string" ? v : null;
}

// Orquestrador: gera o NOSSO link de afiliado p/ uma URL de produto.
// Retorna o link ou null (sem config/sessão → caller mantém o link original).
export async function generateAffiliate(productUrl, env) {
  if (!productUrl) return null;
  try {
    if (isShopeeUrl(productUrl)) {
      return env.SHOPEE_AFFILIATE_ID ? shopeeAffiliateUrl(productUrl, env.SHOPEE_AFFILIATE_ID) : null;
    }
    if (isMlUrl(productUrl)) {
      if (!env.ML_AFFILIATE_TAG || !env.OFFERS_KV) return null;
      const cookies = await env.OFFERS_KV.get(ML_SESSION_KEY);
      if (!cookies) return null;
      const out = await mlAffiliateLink(productUrl, env.ML_AFFILIATE_TAG, cookies);
      if (out.cookies && out.cookies !== cookies) await env.OFFERS_KV.put(ML_SESSION_KEY, out.cookies);
      return out.link || null;
    }
  } catch (_) {
    return null; // nunca quebra a captação por causa do afiliado
  }
  return null;
}

export { ML_SESSION_KEY };
