interface PendingOAuth {
  codeVerifier: string;
  returnTo: string;
  createdAt: number;
}

const memoryStore = new Map<string, PendingOAuth>();

// Clean up entries older than 15 minutes
function cleanup() {
  const now = Date.now();
  for (const [key, value] of memoryStore.entries()) {
    if (now - value.createdAt > 15 * 60 * 1000) {
      memoryStore.delete(key);
    }
  }
}

export function savePendingOAuth(state: string, codeVerifier: string, returnTo: string = "/dashboard"): void {
  cleanup();
  memoryStore.set(state, {
    codeVerifier,
    returnTo,
    createdAt: Date.now(),
  });
}

export function getPendingOAuth(state: string): { codeVerifier: string; returnTo: string } | null {
  cleanup();
  const entry = memoryStore.get(state);
  return entry ? { codeVerifier: entry.codeVerifier, returnTo: entry.returnTo } : null;
}

export function deletePendingOAuth(state: string): void {
  memoryStore.delete(state);
}

