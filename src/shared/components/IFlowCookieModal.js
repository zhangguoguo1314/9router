"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Modal, Button, Input } from "@/shared/components";

/**
 * iFlow Cookie Authentication Modal
 * User pastes browser cookie to get fresh API key
 */
export default function IFlowCookieModal({ isOpen, onSuccess, onClose }) {
  const [cookie, setCookie] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!cookie.trim()) {
      setError("请粘贴您的 Cookie");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/oauth/iflow/cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: cookie.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "认证失败");
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCookie("");
    setError(null);
    setSuccess(false);
    onClose?.();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="iFlow Cookie Authentication">
      <div className="space-y-4">
        {success ? (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">✅</div>
            <p className="text-lg font-medium text-text-primary">认证成功！</p>
            <p className="text-sm text-text-muted mt-2">已获取新的 API 密钥</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-sm text-text-muted">
                要获取新的 API 密钥，请粘贴您从{" "}
                <a
                  href="https://platform.iflow.cn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  platform.iflow.cn
                </a>
                复制的浏览器 Cookie
              </p>
              <div className="bg-surface-secondary p-3 rounded-lg text-xs space-y-2">
                <p className="font-medium text-text-primary">如何获取 Cookie：</p>
                <ol className="list-decimal list-inside space-y-1 text-text-muted">
                  <li>在浏览器中打开 platform.iflow.cn</li>
                  <li>登录您的账户</li>
                  <li>打开开发者工具 (F12) → 应用/存储 → Cookie</li>
                  <li>复制完整的 Cookie 字符串（必须包含 BXAuth）</li>
                  <li>粘贴到下方</li>
                </ol>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-primary">
                Cookie 字符串
              </label>
              <textarea
                value={cookie}
                onChange={(e) => setCookie(e.target.value)}
                placeholder="BXAuth=xxx; ..."
                className="w-full px-3 py-2 bg-surface-secondary border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                rows={4}
                disabled={loading}
              />
            </div>

            {error && (
              <div className="p-3 bg-error/10 border border-error/20 rounded-lg">
                <p className="text-sm text-error">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={handleClose} disabled={loading} fullWidth>
                取消
              </Button>
              <Button onClick={handleSubmit} loading={loading} fullWidth>
                认证
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

IFlowCookieModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onSuccess: PropTypes.func,
  onClose: PropTypes.func,
};
