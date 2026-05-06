import { loadOffers, sortByDateDesc, tagCounts, escapeHtml } from "./_lib/data.js";
import { SITE } from "./_lib/render.js";

export async function onRequestGet(context) {
  const offers = sortByDateDesc(await loadOffers(context.env));
  const tags = tagCounts(offers);
  const today = new Date().toISOString().slice(0, 10);

  const urls = [
    { loc: `${SITE.origin}/`, lastmod: today, changefreq: "daily", priority: "1.0" },
    { loc: `${SITE.origin}/captar`, lastmod: today, changefreq: "monthly", priority: "0.3" }
  ];

  for (const t of tags) {
    urls.push({
      loc: `${SITE.origin}/tag/${encodeURIComponent(t.slug)}/`,
      lastmod: today,
      changefreq: "weekly",
      priority: "0.7"
    });
  }
  for (const o of offers) {
    urls.push({
      loc: `${SITE.origin}/oferta/${encodeURIComponent(o.slug)}/`,
      lastmod: (o.addedAt || today).slice(0, 10),
      changefreq: "weekly",
      priority: "0.8"
    });
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${escapeHtml(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
      )
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}
