// Captura referências visuais (Pechinchou, Promotop) pra analisar a arquitetura
// de informação: sequência, anatomia do card, o que fica acima da dobra.
//   node tools/ref.mjs
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots", "ref");
const refs = [
  { name: "pechinchou", url: "https://www.pechinchou.com.br/" },
  { name: "promotop", url: "https://promotop.net/" }
];
const views = [
  { name: "desktop", width: 1366, height: 900, dsf: 1 },
  { name: "mobile", width: 390, height: 844, dsf: 2 }
];

const browser = await chromium.launch();
for (const r of refs) {
  for (const v of views) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dsf, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" });
    const page = await ctx.newPage();
    try {
      await page.goto(r.url, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SHOTS, `${r.name}-${v.name}-fold.png`) });
      // só os ~2000px do topo pra não pegar página inteira gigante
      await page.screenshot({ path: path.join(SHOTS, `${r.name}-${v.name}-top.png`), clip: { x: 0, y: 0, width: v.width, height: Math.min(2200, v.height * 3) } });
      console.log("OK", r.name, v.name);
    } catch (e) {
      console.log("ERR", r.name, v.name, e.message);
    }
    await ctx.close();
  }
}
await browser.close();
