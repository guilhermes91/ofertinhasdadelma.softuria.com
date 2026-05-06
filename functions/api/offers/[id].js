import { loadOffers, saveOffers, ensureOffer, slugify, uniqueSlug } from "../../_lib/data.js";
import { jsonResponse } from "../../_lib/render.js";

export async function onRequestPut(context) {
  return updateOffer(context);
}

export async function onRequestPatch(context) {
  return updateOffer(context);
}

export async function onRequestDelete(context) {
  const { params, env } = context;
  const id = String(params.id || "").trim();
  const all = await loadOffers(env);
  const next = all.filter((o) => o.id !== id);
  if (next.length === all.length) {
    return jsonResponse({ error: "Oferta não encontrada." }, { status: 404 });
  }
  await saveOffers(env, next);
  return jsonResponse({ ok: true });
}

async function updateOffer(context) {
  const { params, request, env } = context;
  const id = String(params.id || "").trim();
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, { status: 400 });
  }
  const all = await loadOffers(env);
  const idx = all.findIndex((o) => o.id === id);
  if (idx === -1) return jsonResponse({ error: "Oferta não encontrada." }, { status: 404 });

  const current = all[idx];
  const merged = { ...current, ...payload, id: current.id, addedAt: current.addedAt };
  let slug = current.slug;
  if (payload.slug && payload.slug !== current.slug) {
    const baseSlug = slugify(payload.slug);
    slug = uniqueSlug(
      baseSlug,
      all.filter((o) => o.id !== id).map((o) => o.slug)
    );
  }
  const offer = ensureOffer({ ...merged, slug });
  const next = all.slice();
  next[idx] = offer;
  await saveOffers(env, next);
  return jsonResponse({ ok: true, offer });
}
