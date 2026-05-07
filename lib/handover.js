const TTL_MS = parseInt(process.env.HANDOVER_TOKEN_TTL_SECONDS || '300') * 1000;

// In-memory store: token → { accessToken, userInfo, accountUri, expiresAt }
// Tokens are single-use and short-lived; never persisted to avoid triplestore round-trips.
const store = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [token, data] of store) {
    if (data.expiresAt < now) store.delete(token);
  }
}, 60_000);

export function storeHandoverToken(data) {
  const token = crypto.randomUUID();
  store.set(token, { ...data, expiresAt: Date.now() + TTL_MS });
  return token;
}

// Returns the token data and removes it (single-use), or null if invalid/expired.
export function redeemHandoverToken(token) {
  const data = store.get(token);
  if (!data) return null;
  store.delete(token);
  if (data.expiresAt < Date.now()) return null;
  return data;
}
