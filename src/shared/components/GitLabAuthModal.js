"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Modal, Button, Input, OAuthModal } from "@/shared/components";

const GITLAB_COM = "https://gitlab.com";

function getRedirectUri() {
  if (typeof window === "undefined") return "http://localhost/callback";
  const port = window.location.port || (window.location.protocol === "https:" ? "443" : "80");
  return `http://localhost:${port}/callback`;
}

/**
 * GitLab Duo Authentication Modal
 * Supports two modes:
 * - OAuth (PKCE): requires OAuth App Client ID (and optional Client Secret)
 * - PAT: requires Personal Access Token
 */
export default function GitLabAuthModal({ isOpen, providerInfo, onSuccess, onClose }) {
  const [mode, setMode] = useState(null); // null | "oauth" | "pat"
  const [baseUrl, setBaseUrl] = useState(GITLAB_COM);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [pat, setPat] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showOAuth, setShowOAuth] = useState(false);
  const [oauthMeta, setOauthMeta] = useState(null);

  const reset = () => {
    setMode(null);
    setBaseUrl(GITLAB_COM);
    setClientId("");
    setClientSecret("");
    setPat("");
    setError(null);
    setLoading(false);
    setShowOAuth(false);
    setOauthMeta(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleOAuthStart = () => {
    if (!clientId.trim()) {
      setError("Client ID 必填");
      return;
    }
    setError(null);
    setOauthMeta({ baseUrl: baseUrl.trim() || GITLAB_COM, clientId: clientId.trim(), clientSecret: clientSecret.trim() });
    setShowOAuth(true);
  };

  const handlePATSubmit = async () => {
    if (!pat.trim()) {
      setError("Personal Access Token 必填");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/oauth/gitlab/pat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: pat.trim(), baseUrl: baseUrl.trim() || GITLAB_COM }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "认证失败");
      onSuccess?.();
      handleClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Sub-modal for OAuth PKCE flow
  if (showOAuth && oauthMeta) {
    return (
      <OAuthModal
        isOpen
        provider="gitlab"
        providerInfo={providerInfo}
        oauthMeta={oauthMeta}
        onSuccess={() => { onSuccess?.(); handleClose(); }}
        onClose={() => { setShowOAuth(false); setOauthMeta(null); }}
      />
    );
  }

  return (
    <Modal isOpen={isOpen} title="连接 GitLab Duo" onClose={handleClose} size="lg">
      <div className="flex flex-col gap-4">
        {/* Mode selection */}
        {!mode && (
          <>
            <p className="text-sm text-text-muted">
              选择 GitLab Duo 的认证方式：
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode("oauth")}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
              >
                <span className="material-symbols-outlined text-2xl text-primary">lock_open</span>
                <div>
                  <p className="text-sm font-medium">OAuth 应用</p>
                  <p className="text-xs text-text-muted">使用 GitLab OAuth 应用</p>
                </div>
              </button>
              <button
                onClick={() => setMode("pat")}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
              >
                <span className="material-symbols-outlined text-2xl text-primary">key</span>
                <div>
                  <p className="text-sm font-medium">Personal Access Token</p>
                  <p className="text-xs text-text-muted">使用带 api 范围的 GitLab PAT</p>
                </div>
              </button>
            </div>
          </>
        )}

        {/* OAuth mode */}
        {mode === "oauth" && (
          <>
            <p className="text-xs text-text-muted">
              在{" "}
              <a href={`${baseUrl.trim() || GITLAB_COM}/-/profile/applications`} target="_blank" rel="noreferrer" className="text-primary underline">
                GitLab 应用
              </a>{" "}
              创建 OAuth 应用，重定向 URI 为{" "}
              <code className="bg-sidebar px-1 rounded text-xs">{getRedirectUri()}</code>
            </p>
            <Input label="GitLab Base URL" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={GITLAB_COM} />
            <Input label="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="你的 OAuth 应用 client ID" />
            <Input label="Client Secret（PKCE 可选）" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="公开 PKCE 应用留空" />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={handleOAuthStart} fullWidth disabled={!clientId.trim()}>
                授权
              </Button>
              <Button onClick={() => { setMode(null); setError(null); }} variant="ghost" fullWidth>
                返回
              </Button>
            </div>
          </>
        )}

        {/* PAT mode */}
        {mode === "pat" && (
          <>
            <p className="text-xs text-text-muted">
              在{" "}
              <a href={`${baseUrl.trim() || GITLAB_COM}/-/user_settings/personal_access_tokens`} target="_blank" rel="noreferrer" className="text-primary underline">
                GitLab Access Tokens
              </a>{" "}
              创建 PAT，范围需包含：<code className="bg-sidebar px-1 rounded text-xs">api</code>、{" "}
              <code className="bg-sidebar px-1 rounded text-xs">read_user</code> 和{" "}
              <code className="bg-sidebar px-1 rounded text-xs">ai_features</code>。
            </p>
            <Input label="GitLab Base URL" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={GITLAB_COM} />
            <Input label="Personal Access Token" value={pat} onChange={(e) => setPat(e.target.value)} placeholder="glpat-xxxxxxxxxxxxxxxxxxxx" type="password" />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={handlePATSubmit} fullWidth disabled={!pat.trim() || loading} loading={loading}>
                连接
              </Button>
              <Button onClick={() => { setMode(null); setError(null); }} variant="ghost" fullWidth>
                返回
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

GitLabAuthModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  providerInfo: PropTypes.shape({ name: PropTypes.string }),
  onSuccess: PropTypes.func,
  onClose: PropTypes.func.isRequired,
};
