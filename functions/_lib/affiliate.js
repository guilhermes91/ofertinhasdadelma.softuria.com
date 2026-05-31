// Geração de link de afiliado DELEGADA à API externa (gerador-link-afiliados).
// A responsabilidade de sessão ML/Shopee é DELA — aqui só chamamos /v2/generate.
//
// ⚠️ Por padrão o edge NÃO chama nada: a API roda numa EC2 sob demanda (pode estar
// desligada) e o fetch do Workers bloqueia a porta 8000 → chamar do edge travaria
// no timeout. A monetização real roda no GitHub Actions (workflow relink.yml), que
// alcança a API e grava os links de volta via POST /api/relink {updates}.
//
// Só ativa no edge se AFFILIATE_API_URL estiver setado (ex.: a API exposta em HTTPS
// numa porta permitida). Mesmo aí, degrada com segurança: qualquer falha → null, e o
// caller usa a URL de produto LIMPA — NUNCA o link da fonte/concorrente.

// Hostname (NÃO IP — o fetch do Workers recusa IP cru com erro 1003). DNS-only.
// Sobrescrevível por AFFILIATE_API_URL (ex.: quando a API for exposta em HTTPS/443).
const DEFAULT_API_BASE = "http://oj0d367pnr.softuria.com:8000";
const TIMEOUT_MS = 9000; // cobre o fallback v1 (playwright ~7s); ainda seguro p/ 1 oferta
const GENERATE_PATH = "/v2/generate";

// compat: /api/ml-session (legado) ainda importa isto. A sessão ML agora é da API externa.
export const ML_SESSION_KEY = "ml:session";

// Chama a API externa pra 1 URL de produto. Exportada pra reuso (edge e testes).
// Retorna o link de afiliado (short_url/affiliate_url) ou null.
export async function affiliateFromApi(productUrl, baseUrl, fetchImpl = fetch) {
  if (!productUrl || !baseUrl) return null;
  const url = `${String(baseUrl).replace(/\/+$/, "")}${GENERATE_PATH}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ url: productUrl }),
      signal: ctrl.signal
    });
    if (!res.ok) return null;
    const data = await res.json();
    return pickLink(data);
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ML → short_url; Shopee → affiliate_url; fallback long_url (ainda é a NOSSA tag).
export function pickLink(data) {
  if (!data || typeof data !== "object") return null;
  const link = data.short_url || data.affiliate_url || data.long_url;
  return typeof link === "string" && /^https?:\/\//i.test(link) ? link : null;
}

// Orquestrador usado por bot.js / captar.js (edge). Só chama a API se configurada.
export async function generateAffiliate(productUrl, env) {
  if (!productUrl) return null;
  const base = (env && env.AFFILIATE_API_URL) || DEFAULT_API_BASE;
  return affiliateFromApi(productUrl, base);
}
