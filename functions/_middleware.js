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
  const isWrite = isApi && !READ_METHODS.has(method);

  // /captar is public on purpose (single-shot capture link).
  const requiresAuth = isAdminPage || isScrape || isWrite;

  if (requiresAuth && !checkBasicAuth(request, env)) {
    return unauthorized();
  }

  return next();
}
