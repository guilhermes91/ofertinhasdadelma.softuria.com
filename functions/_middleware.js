import { checkBasicAuth, unauthorized } from "./_lib/auth.js";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  const isAdminPage = path.startsWith("/admin");
  const isApi = path.startsWith("/api/");
  const isScrape = path === "/api/scrape";
  const isBot = path === "/api/bot";
  const isReport = path === "/api/report";
  const isWrite = isApi && !READ_METHODS.has(method);

  // /captar, /api/bot e /api/report são públicos de propósito: bot tem token próprio;
  // report é rate-limited por IP. /api/expire continua exigindo Basic Auth (admin).
  const requiresAuth = isAdminPage || isScrape || (isWrite && !isBot && !isReport);

  if (requiresAuth && !checkBasicAuth(request, env)) {
    return unauthorized();
  }

  return next();
}
