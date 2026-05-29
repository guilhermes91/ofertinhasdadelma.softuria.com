// Smoke test de renderização SSR. Mocka o KV e renderiza as páginas pra garantir
// que os templates não quebram e que o SEO/de-geo saíram corretos.
//   node scripts/smoke-render.mjs

import { onRequestGet as home } from "../functions/index.js";
import { onRequestGet as offerPage } from "../functions/oferta/[slug].js";
import { onRequestGet as tagPage } from "../functions/tag/[slug].js";
import { onRequestGet as sitemap } from "../functions/sitemap.xml.js";
import { ensureOffer } from "../functions/_lib/data.js";

const offers = [
  ensureOffer({ title: "Mouse Gamer X 24000dpi", priceCurrent: 99.9, priceOld: 129.9, image: "https://http2.mlstatic.com/x.webp", link: "https://meli.la/aaa", tags: ["mouse", "gamer", "perifericos"], slug: "mouse-gamer-x" }),
  ensureOffer({ title: "Teclado Mecânico Y RGB", priceCurrent: 199, image: "https://http2.mlstatic.com/y.webp", link: "https://meli.la/bbb", tags: ["teclado", "gamer"], slug: "teclado-mecanico-y" }),
  ensureOffer({ title: "Manta Soft Casal", priceCurrent: 39.9, image: "https://http2.mlstatic.com/z.webp", link: "https://meli.la/ccc", tags: ["casa", "manta"], slug: "manta-soft" })
];
const env = { OFFERS_KV: { get: async () => JSON.stringify(offers), put: async () => {} } };
const ctx = (url, params) => ({ request: new Request(url), env, params });

let fails = 0;
async function check(name, res, must, mustNot = []) {
  const html = await res.text();
  const missing = must.filter((m) => !html.includes(m));
  const leaked = mustNot.filter((m) => html.includes(m));
  const ok = res.status < 400 && missing.length === 0 && leaked.length === 0;
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name} [${res.status}]` +
    (missing.length ? ` | faltou: ${missing.join(", ")}` : "") +
    (leaked.length ? ` | vazou: ${leaked.join(", ")}` : ""));
}

await check("home", await home(ctx("https://x/")),
  ["FAQPage", "Perguntas frequentes", '"@type":"Organization"', "mouse-gamer-x", "no Mercado Livre"],
  ["Guaruj"]);
await check("oferta", await offerPage(ctx("https://x/oferta/mouse-gamer-x/", { slug: "mouse-gamer-x" })),
  ["NewCondition", "priceValidUntil", "Mais ofertinhas pra você", "Entrega pra todo o Brasil", "teclado-mecanico-y"],
  ["Guaruj"]);
await check("tag", await tagPage(ctx("https://x/tag/gamer/", { slug: "gamer" })),
  ["em oferta", '"@type":"ItemList"', "mouse-gamer-x"],
  ["Guaruj"]);
await check("sitemap", await sitemap(ctx("https://x/sitemap.xml")),
  ["image:image", "/oferta/mouse-gamer-x/", "http2.mlstatic.com"],
  []);

console.log(fails === 0 ? "\n✅ SMOKE OK" : `\n❌ ${fails} falha(s)`);
process.exit(fails === 0 ? 0 : 1);
