"use client";

import { useState, useEffect } from "react";
import { getDefaultPricing, formatCost } from "open-sse/providers/pricing.js";

export default function PricingModal({ isOpen, onClose, onSave }) {
  const [pricingData, setPricingData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPricing();
    }
  }, [isOpen]);

  const loadPricing = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/pricing");
      if (response.ok) {
        const data = await response.json();
        setPricingData(data);
      } else {
        // Fallback to defaults
        const defaults = getDefaultPricing();
        setPricingData(defaults);
      }
    } catch (error) {
      console.error("Failed to load pricing:", error);
      const defaults = getDefaultPricing();
      setPricingData(defaults);
    } finally {
      setLoading(false);
    }
  };

  const handlePricingChange = (provider, model, field, value) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return;

    setPricingData(prev => {
      const newData = { ...prev };
      if (!newData[provider]) newData[provider] = {};
      if (!newData[provider][model]) newData[provider][model] = {};
      newData[provider][model][field] = numValue;
      return newData;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pricingData)
      });

      if (response.ok) {
        onSave?.();
        onClose();
      } else {
        const error = await response.json();
        alert(`保存定价失败：${error.error}`);
      }
    } catch (error) {
      console.error("Failed to save pricing:", error);
      alert("保存定价失败");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("将所有定价重置为默认值？此操作不可撤销。")) return;

    try {
      const response = await fetch("/api/pricing", { method: "DELETE" });
      if (response.ok) {
        const defaults = getDefaultPricing();
        setPricingData(defaults);
      }
    } catch (error) {
      console.error("Failed to reset pricing:", error);
      alert("重置定价失败");
    }
  };

  if (!isOpen) return null;

  // Get all unique providers and models for display
  const allProviders = Object.keys(pricingData).sort();
  const pricingFields = ["input", "output", "cached", "reasoning", "cache_creation"];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-base border border-border rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-xl font-semibold">定价配置</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-text-muted">加载定价数据中...</div>
          ) : (
            <div className="space-y-6">
              {/* Instructions */}
              <div className="bg-bg-subtle border border-border rounded-lg p-3 text-sm">
                <p className="font-medium mb-1">定价费率格式</p>
                <p className="text-text-muted">
                  所有费率单位为 <strong>每百万 Token 美元</strong>（$/1M tokens）。
                  示例：输入费率为 2.50 表示每 1,000,000 输入 Token 收费 $2.50。
                </p>
              </div>

              {/* Pricing Tables */}
              {allProviders.map(provider => {
                const models = Object.keys(pricingData[provider]).sort();
                return (
                  <div key={provider} className="border border-border rounded-lg overflow-hidden">
                    <div className="bg-bg-subtle px-4 py-2 font-semibold text-sm">
                      {provider.toUpperCase()}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-bg-hover text-text-muted uppercase text-xs">
                          <tr>
                            <th className="px-3 py-2 text-left">模型</th>
                            <th className="px-3 py-2 text-right">输入</th>
                            <th className="px-3 py-2 text-right">输出</th>
                            <th className="px-3 py-2 text-right">缓存</th>
                            <th className="px-3 py-2 text-right">推理</th>
                            <th className="px-3 py-2 text-right">缓存创建</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {models.map(model => (
                            <tr key={model} className="hover:bg-bg-subtle/50">
                              <td className="px-3 py-2 font-medium">{model}</td>
                              {pricingFields.map(field => (
                                <td key={field} className="px-3 py-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={pricingData[provider][model][field] || 0}
                                    onChange={(e) => handlePricingChange(provider, model, field, e.target.value)}
                                    className="w-20 px-2 py-1 text-right bg-bg-base border border-border rounded focus:outline-none focus:border-primary"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              {allProviders.length === 0 && (
                <div className="text-center py-8 text-text-muted">
                  暂无定价数据
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between gap-2">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 rounded border border-red-500/20 transition-colors"
            disabled={saving}
          >
            重置为默认值
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-muted hover:text-text border border-border rounded transition-colors"
              disabled={saving}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "保存中..." : "保存更改"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}