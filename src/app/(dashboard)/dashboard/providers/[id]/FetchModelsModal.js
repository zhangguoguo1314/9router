"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import { Modal, Input, Button, Badge } from "@/shared/components";

export default function FetchModelsModal({
  isOpen,
  onClose,
  providerId,
  connectionId,
  providerAlias,
  isCompatible,
  onSave,
}) {
  const [models, setModels] = useState([]);
  const [existingModelIds, setExistingModelIds] = useState([]);
  const [existingAliases, setExistingAliases] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [saveResult, setSaveResult] = useState(null);
  const abortRef = useRef(null);

  // Fetch remote models when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError("");
    setWarning("");
    setModels([]);
    setExistingModelIds([]);
    setExistingAliases({});
    setSelectedIds(new Set());
    setSaveResult(null);
    setSearchQuery("");

    const controller = new AbortController();
    abortRef.current = controller;

    fetch(`/api/providers/${connectionId}/fetch-models`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (!controller.signal.aborted) {
          if (data.error) {
            setError(data.error);
          } else {
            setModels(data.models || []);
            setExistingModelIds(data.existingModelIds || []);
            setExistingAliases(data.existingAliases || {});
            if (data.warning) setWarning(data.warning);
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to fetch models");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [isOpen, connectionId]);

  // Filter models by search query
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models;
    const q = searchQuery.toLowerCase().trim();
    return models.filter(
      (m) =>
        (m.id || "").toLowerCase().includes(q) ||
        (m.name || "").toLowerCase().includes(q)
    );
  }, [models, searchQuery]);

  // Check if a model already exists
  const isExisting = useCallback(
    (modelId) => existingModelIds.includes(modelId),
    [existingModelIds]
  );

  // Check for cross-provider conflicts
  const getConflictInfo = useCallback(
    (modelId) => {
      // Check if this model ID exists in another provider
      const conflicts = [];
      for (const [alias, fullModel] of Object.entries(existingAliases)) {
        const parts = fullModel.split("/");
        if (parts.length >= 2) {
          const otherModelId = parts.slice(1).join("/");
          if (otherModelId === modelId && !fullModel.startsWith(`${providerAlias}/`)) {
            conflicts.push(fullModel);
          }
        }
      }
      return conflicts;
    },
    [existingAliases, providerAlias]
  );

  // Toggle single model selection
  const toggleModel = useCallback(
    (modelId) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(modelId)) {
          next.delete(modelId);
        } else {
          next.add(modelId);
        }
        return next;
      });
    },
    []
  );

  // Toggle select all (only non-existing, filtered models)
  const toggleSelectAll = useCallback(() => {
    const selectableIds = filteredModels
      .filter((m) => !isExisting(m.id))
      .map((m) => m.id);

    const allSelected = selectableIds.every((id) => selectedIds.has(id));

    if (allSelected) {
      // Deselect all selectable
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of selectableIds) {
          next.delete(id);
        }
        return next;
      });
    } else {
      // Select all selectable
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of selectableIds) {
          next.add(id);
        }
        return next;
      });
    }
  }, [filteredModels, selectedIds, isExisting]);

  // Count stats
  const stats = useMemo(() => {
    const total = filteredModels.length;
    const existingCount = filteredModels.filter((m) => isExisting(m.id)).length;
    const selectableCount = total - existingCount;
    const selectedCount = [...selectedIds].filter((id) =>
      filteredModels.some((m) => m.id === id && !isExisting(m.id))
    ).length;
    const allSelectableSelected =
      selectableCount > 0 && selectedCount === selectableCount;

    return { total, existingCount, selectableCount, selectedCount, allSelectableSelected };
  }, [filteredModels, selectedIds, isExisting]);

  // Collect conflict warnings for selected models
  const selectedConflictWarnings = useMemo(() => {
    const warnings = [];
    for (const modelId of selectedIds) {
      const conflicts = getConflictInfo(modelId);
      if (conflicts.length > 0) {
        warnings.push({ modelId, conflicts });
      }
    }
    return warnings;
  }, [selectedIds, getConflictInfo]);

  // Save selected models
  const handleSave = async () => {
    if (saving || selectedIds.size === 0) return;
    setSaving(true);
    setError("");
    setSaveResult(null);

    try {
      const res = await fetch(`/api/providers/${connectionId}/fetch-models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          selectedModels: [...selectedIds],
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save models");
        return;
      }

      setSaveResult(data);
      if (onSave) {
        onSave(data);
      }
    } catch (err) {
      setError(err.message || "Failed to save models");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (abortRef.current) abortRef.current.abort();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`拉取模型 - ${providerAlias}`}
      size="lg"
      footer={
        saveResult ? (
          <Button variant="primary" onClick={handleClose}>
            完成
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={handleClose} disabled={saving}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving || selectedIds.size === 0}
              loading={saving}
              icon="download"
            >
              {saving
                ? "保存中..."
                : `确认添加 (${stats.selectedCount})`}
            </Button>
          </>
        )
      }
    >
      {saveResult ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <span className="material-symbols-outlined text-xl">check_circle</span>
            <span className="text-sm font-medium">
              成功保存 {saveResult.totalSaved} 个模型
            </span>
          </div>

          {saveResult.savedModels?.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
              {saveResult.savedModels.map((m) => (
                <div
                  key={m.modelId}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 text-sm"
                >
                  <span className="material-symbols-outlined text-sm text-green-500">
                    check
                  </span>
                  <span className="text-text-main">{m.modelId}</span>
                  {m.alias && (
                    <Badge variant="info" size="sm">
                      {m.alias}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          {saveResult.conflicts?.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400">
                以下模型存在冲突：
              </p>
              {saveResult.conflicts.map((c, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20"
                >
                  <span className="material-symbols-outlined text-sm text-yellow-500 mt-0.5">
                    warning
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-text-main">{c.modelId}</span>
                    <span className="text-xs text-text-muted">
                      {c.reason === "alias_exists"
                        ? `别名已存在: ${c.alias}`
                        : c.reason === "alias_conflict"
                        ? `别名冲突: ${c.alias}`
                        : c.reason === "cross_provider_conflict"
                        ? `与其他 provider 冲突: ${c.providers?.join(", ")}`
                        : c.reason}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Warning from API */}
          {warning && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <span className="material-symbols-outlined text-sm text-yellow-500 mt-0.5">
                warning
              </span>
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                {warning}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <span className="material-symbols-outlined text-sm text-red-500 mt-0.5">
                error
              </span>
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Search */}
          <Input
            placeholder="搜索模型..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon="search"
          />

          {/* Stats bar */}
          {!loading && models.length > 0 && (
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>
                共 {stats.total} 个模型，{stats.existingCount} 个已存在，
                {stats.selectableCount} 个可选择
              </span>
              {stats.selectableCount > 0 && (
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <span className="material-symbols-outlined text-sm">
                    {stats.allSelectableSelected
                      ? "deselect"
                      : "select_all"}
                  </span>
                  {stats.allSelectableSelected ? "取消全选" : "全选"}
                </button>
              )}
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <span className="material-symbols-outlined text-3xl text-text-muted animate-spin">
                progress_activity
              </span>
              <p className="text-sm text-text-muted">正在拉取模型列表...</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && models.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <span className="material-symbols-outlined text-3xl text-text-muted">
                cloud_off
              </span>
              <p className="text-sm text-text-muted">未获取到模型列表</p>
            </div>
          )}

          {/* Model list */}
          {!loading && filteredModels.length > 0 && (
            <div className="flex flex-col gap-1 max-h-[400px] overflow-y-auto custom-scrollbar">
              {filteredModels.map((model) => {
                const exists = isExisting(model.id);
                const isSelected = selectedIds.has(model.id);
                const conflicts = getConflictInfo(model.id);

                return (
                  <label
                    key={model.id}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-[10px] cursor-pointer
                      transition-colors
                      ${exists
                        ? "bg-surface-2/50 opacity-60 cursor-default"
                        : isSelected
                        ? "bg-brand-500/10 border border-brand-500/30"
                        : "hover:bg-surface-2 border border-transparent"
                      }
                    `}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={exists ? true : isSelected}
                      disabled={exists}
                      onChange={() => toggleModel(model.id)}
                      className="w-4 h-4 rounded border-border accent-brand-500"
                    />

                    {/* Model info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-main truncate">
                          {model.id}
                        </span>
                        {exists && (
                          <Badge variant="default" size="sm">
                            已存在
                          </Badge>
                        )}
                        {conflicts.length > 0 && !exists && (
                          <Badge variant="warning" size="sm" icon="warning">
                            冲突
                          </Badge>
                        )}
                      </div>
                      {model.name && model.name !== model.id && (
                        <p className="text-xs text-text-muted truncate mt-0.5">
                          {model.name}
                        </p>
                      )}
                    </div>

                    {/* Conflict detail tooltip */}
                    {conflicts.length > 0 && !exists && (
                      <div className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400 shrink-0">
                        <span className="material-symbols-outlined text-sm">
                          info
                        </span>
                      </div>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          {/* No search results */}
          {!loading && models.length > 0 && filteredModels.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <span className="material-symbols-outlined text-2xl text-text-muted">
                search_off
              </span>
              <p className="text-sm text-text-muted">未找到匹配的模型</p>
            </div>
          )}

          {/* Conflict explanation area */}
          {selectedConflictWarnings.length > 0 && (
            <div className="flex flex-col gap-2 mt-2 pt-3 border-t border-border">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-yellow-500">
                  warning
                </span>
                <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400">
                  冲突说明 ({selectedConflictWarnings.length})
                </p>
              </div>
              <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
                {selectedConflictWarnings.slice(0, 5).map((w) => (
                  <div
                    key={w.modelId}
                    className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-yellow-500/5 text-xs"
                  >
                    <span className="text-text-main font-medium shrink-0">
                      {w.modelId}
                    </span>
                    <span className="text-text-muted">
                      与 {w.conflicts.join(", ")} 冲突
                    </span>
                  </div>
                ))}
                {selectedConflictWarnings.length > 5 && (
                  <p className="text-xs text-text-muted px-2.5">
                    ...还有 {selectedConflictWarnings.length - 5} 个冲突
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1 px-2.5">
                <p className="text-[10px] text-text-muted leading-relaxed">
                  - 模型ID与其他provider的模型冲突（如两个provider都有相同的模型ID）
                </p>
                <p className="text-[10px] text-text-muted leading-relaxed">
                  - Compatible provider使用prefix作为前缀，可能导致别名冲突
                </p>
                <p className="text-[10px] text-text-muted leading-relaxed">
                  - 模型名称重复可能导致alias冲突
                </p>
                <p className="text-[10px] text-text-muted leading-relaxed">
                  - 免费API可能有速率限制，大量添加时请注意
                </p>
              </div>
            </div>
          )}

          {/* General conflict info when no specific conflicts */}
          {selectedConflictWarnings.length === 0 && selectedIds.size > 0 && (
            <div className="flex flex-col gap-1 mt-2 pt-3 border-t border-border px-2.5">
              <p className="text-[10px] text-text-muted leading-relaxed">
                提示：添加的模型如果与其他provider的模型ID相同，可能导致路由冲突。Compatible provider会自动添加前缀以避免冲突。
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

FetchModelsModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  providerId: PropTypes.string.isRequired,
  connectionId: PropTypes.string.isRequired,
  providerAlias: PropTypes.string.isRequired,
  isCompatible: PropTypes.bool,
  onSave: PropTypes.func,
};
