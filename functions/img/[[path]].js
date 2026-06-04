// Serve as imagens hospedadas por nós a partir do R2 (binding IMG_BUCKET). Rota: /img/<key>
// (ex.: /img/<hash>.jpg — path único, sem prefixo de loja). Cacheado na borda como immutable — depois do 1º hit, a
// Cloudflare serve sem nem invocar a Function. R2 via binding NÃO gasta subrequest.
// O /api/mirror só reescreve offer.image PRA ESTE caminho DEPOIS de gravar no R2 (put antes
// de reescrever) → a key sempre existe quando alguém a pede; miss real só se o objeto sumir.
export async function onRequestGet(context) {
  const { params, env, request } = context;
  const key = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");
  if (!key || key.includes("..") || !env.IMG_BUCKET) {
    return new Response("Not found", { status: 404 });
  }

  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  const obj = await env.IMG_BUCKET.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers); // content-type gravado no put
  if (!headers.get("content-type")) headers.set("content-type", "image/jpeg");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (obj.httpEtag) headers.set("ETag", obj.httpEtag);

  const res = new Response(obj.body, { headers });
  context.waitUntil(cache.put(request, res.clone()));
  return res;
}
