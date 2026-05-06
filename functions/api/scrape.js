import { scrapeOffer } from "../_lib/scraper.js";
import { jsonResponse } from "../_lib/render.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, { status: 400 });
  }
  const url = (payload && payload.url) || "";
  if (!url) return jsonResponse({ error: "Faltou o campo url." }, { status: 400 });

  try {
    const offer = await scrapeOffer(url, env);
    return jsonResponse({ ok: true, offer });
  } catch (err) {
    return jsonResponse({ error: err.message || "Falha no scraping." }, { status: 422 });
  }
}
