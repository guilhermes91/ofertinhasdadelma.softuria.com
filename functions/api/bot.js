// Bot de captação automática: descobre ofertas de Mercado Livre nos portais,
// dedup contra o catálogo, enriquece via Gemini (mesma mecânica do /captar) e
// auto-publica. Protegido por token (BOT_TOKEN). Disparado pelo GitHub Actions
// (cron) — que vem DESARMADO por padrão (ver .github/workflows/bot.yml).
//
// Uso: POST/GET /api/bot?max=8[&dry=1]  com  Authorization: Bearer <BOT_TOKEN>

import { scrapeOffer } from "../_lib/scraper.js";
import {
  loadOffers,
  saveOffers,
  ensureOffer,
  slugify,
  uniqueSlug
} from "../_lib/data.js";
import { jsonResponse } from "../_lib/render.js";
import { discoverMlOffers } from "../_lib/portals.js";

const DEFAULT_MAX = 8; // teto por execução — protege a cota do Gemini
const HARD_MAX = 20;

export async function onRequestPost(context) {
  return run(context);
}
export async function onRequestGet(context) {
  return run(context);
}

async function run(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Token gate — fail closed.
  const expected = env.BOT_TOKEN;
  if (!expected) {
    return jsonResponse(
      { error: "BOT_TOKEN não configurado no ambiente do Pages." },
      { status: 503 }
    );
  }
  const provided =
    (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token") ||
    "";
  if (provided !== expected) {
    return jsonResponse({ error: "Token inválido." }, { status: 401 });
  }

  const max = Math.min(
    parseInt(url.searchParams.get("max") || "", 10) || DEFAULT_MAX,
    HARD_MAX
  );
  const dry = url.searchParams.get("dry") === "1";

  let candidates = [];
  try {
    candidates = await discoverMlOffers();
  } catch (err) {
    return jsonResponse(
      { error: "Falha na descoberta: " + (err.message || "") },
      { status: 502 }
    );
  }

  const all = await loadOffers(env);
  const existing = new Set(all.map((o) => normalizeLink(o.link)));
  const fresh = candidates
    .filter((l) => !existing.has(normalizeLink(l)))
    .slice(0, max);

  const added = [];
  const errors = [];
  let offers = all;

  for (const link of fresh) {
    try {
      const scraped = await scrapeOffer(link, env);
      if (!scraped.title || scraped.priceCurrent == null) {
        errors.push({ link, reason: "sem título ou preço" });
        continue;
      }
      const slug = uniqueSlug(
        slugify(scraped.title || "oferta"),
        offers.map((o) => o.slug)
      );
      const offer = ensureOffer({ ...scraped, slug, link, seller: "Mercado Livre" });
      offers = [offer, ...offers];
      added.push({ slug: offer.slug, title: offer.title, price: offer.priceCurrent });
    } catch (err) {
      errors.push({ link, reason: err.message || "falha no scrape" });
    }
  }

  if (!dry && added.length) {
    await saveOffers(env, offers);
  }

  return jsonResponse({
    ok: true,
    source: "promotop",
    candidates: candidates.length,
    fresh: fresh.length,
    added: added.length,
    dry,
    items: added,
    errors
  });
}

// Dedup tolerante: ignora query/hash/barra final e caixa.
function normalizeLink(l) {
  return String(l || "")
    .trim()
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}
