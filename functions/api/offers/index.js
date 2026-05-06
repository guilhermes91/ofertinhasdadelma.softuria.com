import {
  loadOffers,
  saveOffers,
  ensureOffer,
  sortByDateDesc,
  slugify,
  uniqueSlug
} from "../../_lib/data.js";
import { jsonResponse } from "../../_lib/render.js";

export async function onRequestGet(context) {
  const offers = sortByDateDesc(await loadOffers(context.env));
  return jsonResponse({ offers });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return jsonResponse({ error: "Payload vazio." }, { status: 400 });
  }
  if (!payload.title || !payload.link) {
    return jsonResponse({ error: "Título e link são obrigatórios." }, { status: 400 });
  }

  const all = await loadOffers(env);
  const baseSlug = slugify(payload.slug || payload.title);
  const slug = uniqueSlug(baseSlug, all.map((o) => o.slug));
  const offer = ensureOffer({ ...payload, slug });

  const next = [offer, ...all];
  await saveOffers(env, next);
  return jsonResponse({ ok: true, offer }, { status: 201 });
}
