/**
 * Smart Session Stickiness for 9Router
 * 
 * Problem: Round Robin switches accounts, each MiMo account has its own
 * isolated conversation context → user sees "context lost".
 * But always using the same account → account gets rate-limited/banned.
 * 
 * Solution: Smart session affinity with automatic rotation:
 * - Same API key uses the same account for up to N requests (default 20)
 * - Or up to T minutes (default 30 min) of continuous use
 * - After limit reached, automatically rotate to next account
 * - On error, immediately switch (not counted against limit)
 * - This balances context continuity with load distribution
 */

import { createHash } from "crypto";

// In-memory session store: Map<sessionKey, SessionState>
const sessionStore = new Map();

// Session TTL: 60 minutes of inactivity (session expires)
const SESSION_TTL_MS = 60 * 60 * 1000;

// Default limits for smart rotation
// High limits to protect accounts while maintaining context:
// - 100 requests = enough for a long coding session
// - 120 minutes = 2 hours before rotating
const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_MAX_DURATION_MS = 120 * 60 * 1000;

// Cleanup interval
let cleanupInterval = null;

function startCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, session] of sessionStore.entries()) {
      if (now - session.lastActivity > SESSION_TTL_MS) {
        sessionStore.delete(key);
      }
    }
  }, 5 * 60 * 1000); // Run every 5 minutes
}

startCleanup();

function getSessionKey(apiKey, providerId) {
  if (!apiKey) return null;
  const hash = createHash("sha256").update(apiKey + "::" + providerId).digest("hex").slice(0, 16);
  return hash;
}

/**
 * Get the pinned connection ID for a session.
 * Returns null if:
 * - No session exists
 * - Session expired
 * - Rotation limit reached (need to switch account)
 * 
 * @param {string} apiKey
 * @param {string} providerId
 * @param {object} limits - Optional overrides: { maxRequests, maxDurationMs }
 * @returns {{ connectionId: string|null, shouldRotate: boolean }}
 */
export function getPinnedConnectionId(apiKey, providerId, limits = {}) {
  const key = getSessionKey(apiKey, providerId);
  if (!key) return { connectionId: null, shouldRotate: false };

  const session = sessionStore.get(key);
  if (!session || !session.connectionId) return { connectionId: null, shouldRotate: false };

  // Check session TTL
  if (Date.now() - session.lastActivity > SESSION_TTL_MS) {
    sessionStore.delete(key);
    return { connectionId: null, shouldRotate: false };
  }

  const maxRequests = limits.maxRequests || DEFAULT_MAX_REQUESTS;
  const maxDurationMs = limits.maxDurationMs || DEFAULT_MAX_DURATION_MS;

  // Check if rotation is needed
  const shouldRotate =
    session.requestCount >= maxRequests ||
    (maxDurationMs > 0 && (Date.now() - session.pinnedAt) >= maxDurationMs);

  if (shouldRotate) {
    // Reset session for new account selection
    session.connectionId = null;
    session.requestCount = 0;
    session.pinnedAt = null;
    session.lastActivity = Date.now();
    return { connectionId: null, shouldRotate: true };
  }

  return { connectionId: session.connectionId, shouldRotate: false };
}

/**
 * Pin a connection to a session (or update existing pin)
 */
export function pinConnection(apiKey, providerId, connectionId) {
  const key = getSessionKey(apiKey, providerId);
  if (!key) return;

  const existing = sessionStore.get(key);
  if (existing && existing.connectionId === connectionId) {
    // Same account, just update counters
    existing.requestCount = (existing.requestCount || 0) + 1;
    existing.lastActivity = Date.now();
  } else {
    // New account or first pin
    sessionStore.set(key, {
      connectionId,
      requestCount: 1,
      pinnedAt: Date.now(),
      lastActivity: Date.now(),
    });
  }
}

/**
 * Unpin a connection (e.g., when it becomes unavailable due to error)
 * Resets counters so the next account gets a fresh start
 */
export function unpinConnection(apiKey, providerId) {
  const key = getSessionKey(apiKey, providerId);
  if (!key) return;
  const session = sessionStore.get(key);
  if (session) {
    session.connectionId = null;
    session.requestCount = 0;
    session.pinnedAt = null;
    session.lastActivity = Date.now();
  }
}

/**
 * Get session stats (for debugging/admin)
 */
export function getSessionStats(apiKey, providerId) {
  const key = getSessionKey(apiKey, providerId);
  if (!key) return null;
  const session = sessionStore.get(key);
  if (!session) return null;
  return {
    connectionId: session.connectionId,
    requestCount: session.requestCount,
    pinnedAt: session.pinnedAt,
    pinnedDurationMs: session.pinnedAt ? Date.now() - session.pinnedAt : 0,
    lastActivity: session.lastActivity,
  };
}

/**
 * Clear a session (e.g., user logout)
 */
export function clearSession(apiKey, providerId) {
  const key = getSessionKey(apiKey, providerId);
  if (key) sessionStore.delete(key);
}
