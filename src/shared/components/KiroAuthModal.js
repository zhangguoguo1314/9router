"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Modal, Button, Input } from "@/shared/components";

/**
 * Kiro Auth Method Selection Modal
 * Auto-detects token from AWS SSO cache or allows manual import
 */
export default function KiroAuthModal({ isOpen, onMethodSelect, onClose }) {
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [idcStartUrl, setIdcStartUrl] = useState("");
  const [idcRegion, setIdcRegion] = useState("us-east-1");
  const [refreshToken, setRefreshToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyRegion, setApiKeyRegion] = useState("us-east-1");
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);

  // Auto-detect token when import method is selected
  useEffect(() => {
    if (selectedMethod !== "import" || !isOpen) return;

    const autoDetect = async () => {
      setAutoDetecting(true);
      setError(null);
      setAutoDetected(false);

      try {
        const res = await fetch("/api/oauth/kiro/auto-import");
        const data = await res.json();

        if (data.found) {
          setRefreshToken(data.refreshToken);
          setAutoDetected(true);
        } else {
          setError(data.error || "无法自动检测 Token");
        }
      } catch (err) {
        setError("自动检测 Token 失败");
      } finally {
        setAutoDetecting(false);
      }
    };

    autoDetect();
  }, [selectedMethod, isOpen]);

  const handleMethodSelect = (method) => {
    setSelectedMethod(method);
    setError(null);
  };

  const handleBack = () => {
    setSelectedMethod(null);
    setError(null);
  };

  const handleImportToken = async () => {
    if (!refreshToken.trim()) {
      setError("请输入 refresh token");
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const res = await fetch("/api/oauth/kiro/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refreshToken.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "导入失败");
      }

      // Success - notify parent to refresh connections
      onMethodSelect("import");
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleIdcContinue = () => {
    if (!idcStartUrl.trim()) {
      setError("请输入你的 IDC 起始 URL");
      return;
    }
    onMethodSelect("idc", { startUrl: idcStartUrl.trim(), region: idcRegion });
  };

  const handleApiKeyImport = async () => {
    if (!apiKey.trim()) {
      setError("请输入 API key");
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const res = await fetch("/api/oauth/kiro/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          region: apiKeyRegion.trim() || "us-east-1",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "导入失败");
      }

      // Success - notify parent to refresh connections
      onMethodSelect("api-key");
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleSocialLogin = (provider) => {
    onMethodSelect("social", { provider });
  };

  return (
    <Modal isOpen={isOpen} title="连接 Kiro" onClose={onClose} size="lg">
      <div className="flex flex-col gap-4">
        {/* Method Selection */}
        {!selectedMethod && (
          <div className="space-y-3">
            <p className="text-sm text-text-muted mb-4">
              选择认证方式：
            </p>

            {/* AWS Builder ID */}
            <button
              onClick={() => onMethodSelect("builder-id")}
              className="w-full p-4 text-left border border-border rounded-lg hover:bg-sidebar transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary mt-0.5">shield</span>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">AWS Builder ID</h3>
                  <p className="text-sm text-text-muted">
                    推荐大多数用户使用。需要免费 AWS 账号。
                  </p>
                </div>
              </div>
            </button>

            {/* AWS IAM Identity Center (IDC) */}
            <button
              onClick={() => handleMethodSelect("idc")}
              className="w-full p-4 text-left border border-border rounded-lg hover:bg-sidebar transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary mt-0.5">business</span>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">AWS IAM Identity Center</h3>
                  <p className="text-sm text-text-muted">
                    面向使用自定义 AWS IAM Identity Center 的企业用户。
                  </p>
                </div>
              </div>
            </button>

            {/* AWS API Key */}
            <button
              onClick={() => handleMethodSelect("api-key")}
              className="w-full p-4 text-left border border-border rounded-lg hover:bg-sidebar transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary mt-0.5">key</span>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">API Key</h3>
                  <p className="text-sm text-text-muted">
                    使用长期有效的 Kiro/CodeWhisperer API key（无头认证）。
                  </p>
                </div>
              </div>
            </button>

            {/* Google Social Login - HIDDEN */}
            <button
              onClick={() => handleMethodSelect("social-google")}
              className="hidden w-full p-4 text-left border border-border rounded-lg hover:bg-sidebar transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary mt-0.5">account_circle</span>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Google 账号</h3>
                  <p className="text-sm text-text-muted">
                    使用 Google 账号登录（手动回调）。
                  </p>
                </div>
              </div>
            </button>

            {/* GitHub Social Login - HIDDEN */}
            <button
              onClick={() => handleMethodSelect("social-github")}
              className="hidden w-full p-4 text-left border border-border rounded-lg hover:bg-sidebar transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary mt-0.5">code</span>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">GitHub 账号</h3>
                  <p className="text-sm text-text-muted">
                    使用 GitHub 账号登录（手动回调）。
                  </p>
                </div>
              </div>
            </button>

            {/* Import Token */}
            <button
              onClick={() => handleMethodSelect("import")}
              className="w-full p-4 text-left border border-border rounded-lg hover:bg-sidebar transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary mt-0.5">file_upload</span>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">导入 Token</h3>
                  <p className="text-sm text-text-muted">
                    从 Kiro IDE 粘贴 refresh token。
                  </p>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* IDC Configuration */}
        {selectedMethod === "idc" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                IDC 起始 URL <span className="text-red-500">*</span>
              </label>
              <Input
                value={idcStartUrl}
                onChange={(e) => setIdcStartUrl(e.target.value)}
                placeholder="https://your-org.awsapps.com/start"
                className="font-mono text-sm"
              />
              <p className="text-xs text-text-muted mt-1">
                你组织的 AWS IAM Identity Center URL
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                AWS 区域
              </label>
              <Input
                value={idcRegion}
                onChange={(e) => setIdcRegion(e.target.value)}
                placeholder="us-east-1"
                className="font-mono text-sm"
              />
              <p className="text-xs text-text-muted mt-1">
                Identity Center 的 AWS 区域（默认：us-east-1）
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex gap-2">
              <Button onClick={handleIdcContinue} fullWidth>
                继续
              </Button>
              <Button onClick={handleBack} variant="ghost" fullWidth>
                返回
              </Button>
            </div>
          </div>
        )}

        {/* API Key */}
        {selectedMethod === "api-key" && (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex gap-2">
                <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">info</span>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  粘贴长期有效的 Kiro/CodeWhisperer API key。它会在 AWS 上验证
                  并直接存储为 bearer 凭证（无需刷新）。
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                API Key <span className="text-red-500">*</span>
              </label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="粘贴你的 Kiro API key..."
                className="font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                AWS 区域
              </label>
              <Input
                value={apiKeyRegion}
                onChange={(e) => setApiKeyRegion(e.target.value)}
                placeholder="us-east-1"
                className="font-mono text-sm"
              />
              <p className="text-xs text-text-muted mt-1">
                该 key 的 AWS 区域（默认：us-east-1）
              </p>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleApiKeyImport} fullWidth disabled={importing || !apiKey.trim()}>
                {importing ? "验证中..." : "添加 API Key"}
              </Button>
              <Button onClick={handleBack} variant="ghost" fullWidth>
                返回
              </Button>
            </div>
          </div>
        )}

        {/* Social Login Info (Google) */}
        {selectedMethod === "social-google" && (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex gap-2">
                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">info</span>
                <div className="flex-1 text-sm">
                  <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">
                    需要手动回调
                  </p>
                  <p className="text-amber-800 dark:text-amber-200">
                    登录后，你需要从浏览器复制回调 URL 并粘贴回此处。
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => handleSocialLogin("google")} fullWidth>
                使用 Google 继续
              </Button>
              <Button onClick={handleBack} variant="ghost" fullWidth>
                返回
              </Button>
            </div>
          </div>
        )}

        {/* Social Login Info (GitHub) */}
        {selectedMethod === "social-github" && (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex gap-2">
                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">info</span>
                <div className="flex-1 text-sm">
                  <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">
                    需要手动回调
                  </p>
                  <p className="text-amber-800 dark:text-amber-200">
                    登录后，你需要从浏览器复制回调 URL 并粘贴回此处。
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => handleSocialLogin("github")} fullWidth>
                使用 GitHub 继续
              </Button>
              <Button onClick={handleBack} variant="ghost" fullWidth>
                返回
              </Button>
            </div>
          </div>
        )}

        {/* Import Token */}
        {selectedMethod === "import" && (
          <div className="space-y-4">
            {/* Auto-detecting state */}
            {autoDetecting && (
              <div className="text-center py-6">
                <div className="size-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-3xl text-primary animate-spin">
                    progress_activity
                  </span>
                </div>
                <h3 className="text-lg font-semibold mb-2">自动检测 token 中...</h3>
                <p className="text-sm text-text-muted">
                  正在读取 AWS SSO 缓存
                </p>
              </div>
            )}

            {/* Form (shown after auto-detect completes) */}
            {!autoDetecting && (
              <>
                {/* Success message if auto-detected */}
                {autoDetected && (
                  <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex gap-2">
                      <span className="material-symbols-outlined text-green-600 dark:text-green-400">check_circle</span>
                      <p className="text-sm text-green-800 dark:text-green-200">
                        成功从 Kiro IDE 自动检测到 Token！
                      </p>
                    </div>
                  </div>
                )}

                {/* Info message if not auto-detected */}
                {!autoDetected && !error && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex gap-2">
                      <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">info</span>
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        未检测到 Kiro IDE。请手动粘贴你的 refresh token。
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Refresh Token <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={refreshToken}
                    onChange={(e) => setRefreshToken(e.target.value)}
                    placeholder="Token 将自动填充..."
                    className="font-mono text-sm"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button onClick={handleImportToken} fullWidth disabled={importing || !refreshToken.trim()}>
                    {importing ? "导入中..." : "导入 Token"}
                  </Button>
                  <Button onClick={handleBack} variant="ghost" fullWidth>
                    返回
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

KiroAuthModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onMethodSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
