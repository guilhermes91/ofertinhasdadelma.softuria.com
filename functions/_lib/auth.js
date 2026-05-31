// Basic Auth helpers (used by /admin and write APIs).

export function unauthorized(realm = "Ofertinhas da Delma — admin") {
  return new Response("Acesso restrito.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"`,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export function checkBasicAuth(request, env) {
  const expectedUser = env.ADMIN_USER || "delma";
  const expectedPass = env.ADMIN_PASS || "";
  if (!expectedPass) return false;
  const header = request.headers.get("Authorization") || "";
  if (!header.toLowerCase().startsWith("basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return false;
  }
  const idx = decoded.indexOf(":");
  if (idx === -1) return false;
  const user = decoded.slice(0, idx);
  const pass = decoded.slice(idx + 1);
  return constantTimeEquals(user, expectedUser) && constantTimeEquals(pass, expectedPass);
}

export function constantTimeEquals(a, b) {
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
