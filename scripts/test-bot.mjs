// Harness de teste LOCAL do bot. Não roda no edge — é só pra validar o fluxo.
//
//   node scripts/test-bot.mjs
//
// Exercita discoverMlOffers() (Promotop) + scrapeOffer() de verdade contra ML.
// Roda SEM GEMINI_API_KEY de propósito → usa o fallbackEnrichment, então valida
// a captação/extração ponta a ponta sem gastar cota de IA. Meta: >= 10 ofertas.

import { discoverMlOffers } from "../functions/_lib/portals.js";
import { scrapeOffer } from "../functions/_lib/scraper.js";
import { ensureOffer, slugify } from "../functions/_lib/data.js";

const TARGET = 10;
const MAX_TRIES = 18; // tenta alguns links a mais que a meta, p/ tolerar falhas
const env = {}; // sem GEMINI_API_KEY → fallback

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("== Descobrindo links de Mercado Livre no Promotop...");
const links = await discoverMlOffers();
console.log(`   ${links.length} links únicos descobertos.\n`);

const captured = [];
const errors = [];

for (const link of links) {
  if (captured.length >= TARGET || errors.length + captured.length >= MAX_TRIES) {
    if (captured.length >= TARGET) break;
  }
  try {
    const scraped = await scrapeOffer(link, env);
    if (!scraped.title || scraped.priceCurrent == null) {
      errors.push([link, "sem título/preço"]);
    } else {
      const offer = ensureOffer({ ...scraped, slug: slugify(scraped.title), link });
      captured.push(offer);
      console.log(
        `OK ${String(captured.length).padStart(2, " ")}. ` +
          `R$ ${String(offer.priceCurrent).padStart(8, " ")}  ` +
          `${offer.image ? "[img]" : "[SEM IMG]"}  ` +
          `${offer.title.slice(0, 58)}`
      );
    }
  } catch (e) {
    errors.push([link, e.message]);
  }
  await sleep(250); // educado com o ML
}

console.log(`\n== Resultado: ${captured.length} capturadas | ${errors.length} erros`);
if (errors.length) {
  console.log("Primeiros erros:");
  for (const [l, r] of errors.slice(0, 6)) console.log("  -", r, "→", l);
}

// Checagens de qualidade do que foi capturado
const comImagem = captured.filter((o) => o.image).length;
const comTags = captured.filter((o) => (o.tags || []).length > 0).length;
const slugsUnicos = new Set(captured.map((o) => o.slug)).size;
console.log(`\n== Qualidade: ${comImagem}/${captured.length} com imagem · ${comTags}/${captured.length} com tags · ${slugsUnicos} slugs únicos`);

if (captured.length >= TARGET) {
  console.log(`\n✅ VALIDADO: ${captured.length} ofertas capturadas (meta ${TARGET}).`);
  process.exit(0);
} else {
  console.log(`\n❌ FALHOU: só ${captured.length} (<${TARGET}). Ajustar fonte/parser.`);
  process.exit(1);
}
