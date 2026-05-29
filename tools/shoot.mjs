// Harness visual: renderiza o SSR real, serve local e tira prints desktop+mobile
// com Playwright/Chromium. Também mede alinhamento/overflow dos cards e a posição
// do CTA na página de oferta.
//   node tools/shoot.mjs
//
// Os dados abaixo são propositalmente "maldosos" pra reproduzir os bugs relatados.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";

import { onRequestGet as home } from "../functions/index.js";
import { onRequestGet as offerPage } from "../functions/oferta/[slug].js";
import { onRequestGet as tagPage } from "../functions/tag/[slug].js";
import { ensureOffer } from "../functions/_lib/data.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(ROOT, "tools", "shots");
const IMG1 = "https://http2.mlstatic.com/D_Q_NP_2X_641838-MLB80679685426_112024-V-10-calcinha-infantil-algodo-tradicional-menina-atacado.webp";
const IMG2 = "https://http2.mlstatic.com/D_Q_NP_2X_660121-MLA100109699395_122025-V.webp";

const offers = [
  ensureOffer({ title: "SmartwatchHuaweiBand11TelaAmoledSuperLongoSemNenhumEspacoProQuebrarOLayoutEStourarOQuadradinhoDaOferta", priceCurrent: 299, priceOld: 399, image: IMG2, link: "https://meli.la/a1", tags: ["smartwatch", "huawei", "wearable"], slug: "smartwatch-longo" }),
  ensureOffer({ title: "Monitor Gamer AOC 24\" 200Hz", priceCurrent: 758.62, priceOld: 999.9, discount: 24, image: IMG1, link: "https://meli.la/a2", tags: ["monitor", "gamer"], bestseller: true, slug: "monitor-aoc" }),
  ensureOffer({ title: "Oferta sem imagem nenhuma pra testar o placeholder do card", priceCurrent: 49.99, image: "", link: "https://meli.la/a3", tags: ["teste"], isNew: true, slug: "sem-imagem" }),
  ensureOffer({ title: "Whey Isolate Protein Fuse Refil 1,8kg", description: "Descrição bem longa de propósito pra ver se o texto transborda o quadradinho da oferta e empurra o resto do conteúdo pra baixo bagunçando o alinhamento do grid inteiro hein.", priceCurrent: 159.9, priceOld: 219, image: IMG2, link: "https://meli.la/a4", tags: ["suplemento", "whey", "academia"], slug: "whey-fuse" }),
  ensureOffer({ title: "Produto Caro Pra Testar Preço Largo", priceCurrent: 1234567.89, image: IMG1, link: "https://meli.la/a5", tags: ["caro"], slug: "caro" }),
  ensureOffer({ title: "Headset Gamer Onikuma B2", priceCurrent: 174.9, priceOld: 249, discount: 30, image: IMG2, link: "https://meli.la/a6", tags: ["headset", "gamer", "audio"], slug: "headset" }),
  ensureOffer({ title: "Mouse Gamer Sem Fio Fire Phoenix 24000dpi", priceCurrent: 129.99, image: IMG1, link: "https://meli.la/a7", tags: ["mouse", "gamer"], bestseller: true, slug: "mouse" }),
  ensureOffer({ title: "Coberta Manta Soft Casal Microfibra", priceCurrent: 39.9, priceOld: 59.9, image: IMG2, link: "https://meli.la/a8", tags: ["casa", "manta"], slug: "manta" }),
  ensureOffer({ title: "Projetor Maxnova HY300 4K Portátil", priceCurrent: 167.44, image: IMG1, link: "https://meli.la/a9", tags: ["projetor", "casa", "cinema"], slug: "projetor" })
];

const env = { OFFERS_KV: { get: async () => JSON.stringify(offers), put: async () => {} } };

const MIME = { ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain" };

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    const p = u.pathname;
    let fn = null;
    let params = {};
    if (p === "/") fn = home;
    else if (p.startsWith("/oferta/")) { fn = offerPage; params = { slug: p.split("/")[2] }; }
    else if (p.startsWith("/tag/")) { fn = tagPage; params = { slug: p.split("/")[2] }; }

    if (fn) {
      const r = await fn({ request: new Request("http://localhost" + req.url), env, params });
      res.writeHead(r.status, { "Content-Type": "text/html; charset=utf-8" });
      res.end(await r.text());
      return;
    }
    // estático do root
    const ext = path.extname(p);
    const buf = await readFile(path.join(ROOT, p));
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(buf);
  } catch (e) {
    res.writeHead(404); res.end("nope: " + e.message);
  }
});

await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;
const base = `http://localhost:${PORT}`;
console.log("Servindo em", base);

const browser = await chromium.launch();
const views = [
  { name: "desktop", width: 1366, height: 900, dsf: 1 },
  { name: "mobile", width: 390, height: 844, dsf: 2 }
];

const report = {};
for (const v of views) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dsf });
  const page = await ctx.newPage();

  // HOME
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(SHOTS, `home-${v.name}-full.png`), fullPage: true });
  await page.screenshot({ path: path.join(SHOTS, `home-${v.name}-fold.png`) }); // só a dobra
  const cardMetrics = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".offer-card")];
    const heights = cards.map((c) => Math.round(c.getBoundingClientRect().height));
    const overflows = cards.filter((c) => c.scrollWidth > c.clientWidth + 1).length;
    // título acima da dobra? posição do primeiro card vs viewport
    const firstCard = cards[0] ? Math.round(cards[0].getBoundingClientRect().top) : null;
    const heroH = document.querySelector(".hero") ? Math.round(document.querySelector(".hero").getBoundingClientRect().height) : null;
    return { count: cards.length, minH: Math.min(...heights), maxH: Math.max(...heights), overflows, firstCardTop: firstCard, heroHeight: heroH, vh: window.innerHeight };
  });

  // OFERTA (com título longo)
  await page.goto(base + "/oferta/whey-fuse/", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(SHOTS, `oferta-${v.name}-full.png`), fullPage: true });
  await page.screenshot({ path: path.join(SHOTS, `oferta-${v.name}-fold.png`) });
  const offerMetrics = await page.evaluate(() => {
    const cta = document.querySelector(".detail__cta");
    const desc = document.querySelector(".detail__desc");
    return {
      ctaTop: cta ? Math.round(cta.getBoundingClientRect().top) : null,
      descTop: desc ? Math.round(desc.getBoundingClientRect().top) : null,
      vh: window.innerHeight
    };
  });

  report[v.name] = { home: cardMetrics, oferta: offerMetrics };
  await ctx.close();
}

await browser.close();
server.close();
console.log(JSON.stringify(report, null, 2));
