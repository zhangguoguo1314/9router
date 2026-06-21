/**
 * Session Stickiness for 9Router
 * 
 * Problem: When Round Robin switches accounts, each MiMo account has its own
 * isolated conversation context. The user sees "context lost" because the
 * new account doesn't know about previous messages.
 * 
 * Solution:
 * 1. Bind each API key to a specific account for a provider (session affinity)
 * 2. Cache conversation history per session
 * 3. When account switch is forced (current account unavailable), sync the
 *    full conversation history to the new account
 */

import { createHash } from "crypto";

// In-memory session store: Map<sessionKey, SessionState>
// sessionKey = hash(apiKey + providerId)
const sessionStore = new Map();

// Session TTL: 30 minutes of inactivity
const SESSION_TTL_MS = 30 * 60 * 1000;

// Max messages to keep per session (prevent memory bloat)
const MAX_MESSAGES_PER_SESSION = 200;

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
 * Get the pinned connection ID for a session
 */
export function getPinnedConnectionId(apiKey, providerId) {
  const key = getSessionKey(apiKey, providerId);
  if (!key) return null;
  const session = sessionStore.get(key);
  if (!session) return null;
  // Check TTL
  if (Date.now() - session.lastActivity > SESSION_TTL_MS) {
    sessionStore.delete(key);
    return null;
  }
  return session.connectionId;
}

/**
 * Pin a connection to a session
 */
export function pinConnection(apiKey, providerId, connectionId) {
  const key = getSessionKey(apiKey, providerId);
  if (!key) return;
  const session = sessionStore.get(key);
  if (session) {
    session.connectionId = connectionId;
    session.lastActivity = Date.now();
  } else {
    sessionStore.set(key, {
      connectionId,
      messages: [],
      lastActivity: Date.now(),
    });
  }
}

/**
 * Unpin a connection (e.g., when it becomes unavailable)
 */
export function unpinConnection(apiKey, providerId) {
  const key = getSessionKey(apiKey, providerId);
  if (!key) return;
  const session = sessionStore.get(key);
  if (session) {
    session.connectionId = null;
    session.lastActivity = Date.now();
  }
}

/**
 * Store conversation messages for a session
 */
export function storeMessages(apiKey, providerId, messages) {
  const key = getSessionKey(apiKey, providerId);
  if (!key) return;
  const session = sessionStore.get(key);
  if (session) {
    // Merge new messages, avoiding duplicates by role+content
    const existingMap = new Map(session.messages.map(m => [`${m.role}:${m.content?.slice(0, 100)}`, m]));
    for (const msg of messages) {
      const mapKey = `${msg.role}:${msg.content?.slice(0, 100)}`;
      if (!existingMap.has(mapKey)) {
        session.messages.push(msg);
      }
    }
    // Trim to max
    if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
      session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
    }
    session.lastActivity = Date.now();
  }
}

/**
 * Get stored messages for a session (for syncing to new account)
 */
export function getStoredMessages(apiKey, providerId) {
  const key = getSessionKey(apiKey, providerId);
  if (!key) return [];
  const session = sessionStore.get(key);
  if (!session) return [];
  if (Date.now() - session.lastActivity > SESSION_TTL_MS) {
    sessionStore.delete(key);
    return [];
  }
  return [...session.messages];
}

/**
 * Sync conversation history into a request body
 * When switching accounts, inject the full conversation history so the
 * new account can continue the conversation seamlessly.
 */
export function syncConversationHistory(body, apiKey, providerId) {
  const stored = getStoredMessages(apiKey, providerId);
  if (!stored.length || !body?.messages) return body;

  // Build a merged message list: system messages first, then user/assistant
  const systemMsgs = body.messages.filter(m => m.role === "system");
  const nonSystemBody = body.messages.filter(m => m.role !== "system");
  const nonSystemStored = stored.filter(m => m.role !== "system");

  // Use stored history as base, append new messages from current request
  // (the last message in body is typically the new user question)
  const merged = [...systemMsgs];

  // Add stored conversation history
  for (const msg of nonSystemStored) {
    merged.push(msg);
  }

  // Add new messages from current request that aren't already in history
  const storedSet = new Set(nonSystemStored.map(m => `${m.role}:${m.content?.slice(0, 200)}`));
  for (const msg of nonSystemBody) {
    const key = `${msg.role}:${msg.content?.slice(0, 200)}`;
    if (!storedSet.has(key)) {
      merged.push(msg);
    }
  }

  return { ...body, messages: merged };
}

/**
 * Extract messages from a response for storage
 */
export function extractMessagesFromResponse(body, response) {
  const messages = [];
  // Add user message from request
  const userMsgs = body.messages?.filter(m => m.role === "user") || [];
  if (userMsgs.length > 0) {
    messages.push(userMsgs[userMsgs.length - 1]);
  }
  // Add assistant message from response
  if (response?.choices?.[0]?.message?.content) {
    messages.push({
      role: "assistant",
      content: response.choices[0].message.content,
    });
  }
  return messages;
}
