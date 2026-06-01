// Geração de link de afiliado DELEGADA à API externa (gerador-aff-links).
// A responsabilidade de sessão ML/Shopee é DELA — aqui só chamamos POST /afiliado.
//
// A API nova é um HOSTNAME HTTPS (alcançável pelo edge do Workers) com Bearer token.
// Envelope: { ok, resultados: [ { ok, short_url, ... } ] }. Aceita {url} ou {urls:[]}.
// Só ativa se AFFILIATE_API_URL + AFFILIATE_API_TOKEN estiverem setados (env do Pages,
// fora do repo público). Degrada com segurança: qualquer falha → null, e o caller usa a
// URL de produto LIMPA — NUNCA o link da fonte/concorrente.
//
// ⚠️ A API REJEITA `produto.mercadolivre.com.br/MLB-<id>`. Mande o `sourceUrl` (meli.la)
// ou uma URL `/p/<mlId>` — ambos aceitos (resolvem o produto e devolvem a NOSSA tag).
const TIMEOUT_MS = 12000;
const GENERATE_PATH = "/afiliado";
const COMPLETE_PATH = "/completo";

// compat: /api/ml-session (legado) ainda importa isto. A sessão ML agora é da API externa.
export const ML_SESSION_KEY = "ml:session";

// Config da API: env do Pages OU KV (aff:url / aff:token — setado pelo relink.yml, igual
// ao bot:token). Assim o edge gera link em tempo real SEM precisar setar env no Cloudflare.
export async function affConfig(env) {
  let base = (env && env.AFFILIATE_API_URL) || "";
  let token = (env && env.AFFILIATE_API_TOKEN) || "";
  if ((!base || !token) && env && env.OFFERS_KV) {
    if (!base) base = (await env.OFFERS_KV.get("aff:url")) || "";
    if (!token) token = (await env.OFFERS_KV.get("aff:token")) || "";
  }
  return { base: base.replace(/\/+$/, ""), token };
}

// Chama a API externa pra 1 URL de produto. Exportada pra reuso (edge e testes).
// Retorna o link de afiliado (short_url) ou null.
export async function affiliateFromApi(productUrl, baseUrl, token, fetchImpl = fetch) {
  if (!productUrl || !baseUrl) return null;
  const url = `${String(baseUrl).replace(/\/+$/, "")}${GENERATE_PATH}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
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

// Novo envelope {ok, resultados:[{ok, short_url}]}. Aceita também o item cru (compat).
// ML → short_url; Shopee → short_url/affiliate_url; só usa quando o item é ok.
export function pickLink(data) {
  const item = data && Array.isArray(data.resultados) ? data.resultados[0] : data;
  if (!item || typeof item !== "object" || item.ok === false) return null;
  const link = item.short_url || item.affiliate_url || item.long_url;
  return typeof link === "string" && /^https?:\/\//i.test(link) ? link : null;
}

// Orquestrador usado por bot.js / captar.js (edge). Só chama a API se configurada.
export async function generateAffiliate(productUrl, env) {
  if (!productUrl) return null;
  const { base, token } = await affConfig(env);
  if (!base) return null; // sem config → caller usa URL limpa
  return affiliateFromApi(productUrl, base, token);
}

// /completo: detalhes (nome/preço/imagem/descrição) + link de afiliado, numa chamada.
// É o caminho confiável pro /captar — a API renderiza o produto direito (o edge não
// consegue ler imagem/preço de alguns formatos de link do ML). Retorna objeto ou null.
export async function completeOffer(productUrl, env) {
  if (!productUrl) return null;
  const { base, token } = await affConfig(env);
  if (!base) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000); // Shopee leva ~20s; ML é rápido
  try {
    const res = await fetch(`${base}${COMPLETE_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ url: productUrl }),
      signal: ctrl.signal
    });
    if (!res.ok) return null;
    const data = await res.json();
    const item = Array.isArray(data.resultados) ? data.resultados[0] : data;
    if (!item || item.ok === false) return null;
    const af = item.afiliado || {};
    const de = item.detalhes || {};
    const link = af.short_url || af.affiliate_url || af.long_url || null;
    const price = de.preco != null ? Number(de.preco) : (de.price != null ? Number(de.price) : null);
    return {
      link: typeof link === "string" && /^https?:\/\//i.test(link) ? link : null,
      name: de.name || "",
      price: Number.isFinite(price) ? price : null,
      image: de.image || "",
      description: de.description || ""
    };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
