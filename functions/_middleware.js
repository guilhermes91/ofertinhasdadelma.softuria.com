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
  const isWrite = isApi && !READ_METHODS.has(method);

  // /captar e /api/bot são públicos de propósito: o bot tem seu próprio token
  // (BOT_TOKEN) verificado no handler, então não passa pelo Basic Auth.
  const requiresAuth = isAdminPage || isScrape || (isWrite && !isBot);

  if (requiresAuth && !checkBasicAuth(request, env)) {
    return unauthorized();
  }

  return next();
}
