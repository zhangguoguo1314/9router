"use client";

import Card from "./Card";

// Only show fields user actually cares about
const FIELD_SCHEMA = {
  mode:             { label: "模式",       format: (v) => v },
  defaultModel:     { label: "模型",      format: (v) => v, mono: true },
  baseUrl:          { label: "端点",   format: (v) => v, isLink: true, mono: true },
  costPerQuery:     { label: "单次费用", format: (v) => v === 0 ? "免费" : `$${v.toFixed(4)}` },
  pricingUrl:       { label: "定价",    format: () => "查看定价", isLink: true },
  freeTier:         { label: "免费层级",  format: (v) => v },
  freeMonthlyQuota: { label: "免费额度",  format: (v) => v === 0 ? "—" : v >= 999999 ? "无限制" : `${v.toLocaleString()} / 月` },
  searchTypes:      { label: "类型",      format: (v) => v.join(", ") },
  formats:          { label: "格式",    format: (v) => v.join(", ") },
  maxMaxResults:    { label: "最大结果数", format: (v) => v },
  maxCharacters:    { label: "最大字符数",  format: (v) => v.toLocaleString() },
};

export default function ProviderInfoCard({ config, provider, title = "提供商信息" }) {
  if (!config) return null;

  const rows = Object.entries(FIELD_SCHEMA)
    .filter(([key]) => config[key] !== undefined && config[key] !== null && config[key] !== "")
    .map(([key, schema]) => ({
      key,
      label: schema.label,
      value: schema.format(config[key]),
      isLink: schema.isLink,
      mono: schema.mono,
      raw: config[key],
    }));

  const signupUrl = provider?.notice?.apiKeyUrl || provider?.website;
  const noticeText = provider?.notice?.text;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {signupUrl && (
          <a
            href={signupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">open_in_new</span>
            获取 API Key
          </a>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-3 min-w-0">
            <span className="text-xs text-text-muted w-28 shrink-0">{r.label}</span>
            {r.isLink ? (
              <a
                href={r.raw}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-sm text-primary hover:underline truncate ${r.mono ? "font-mono" : ""}`}
              >
                {r.value}
              </a>
            ) : (
              <span className={`text-sm text-text-main truncate ${r.mono ? "font-mono" : ""}`}>
                {r.value}
              </span>
            )}
          </div>
        ))}
        {noticeText && (
          <div className="flex items-start gap-3 min-w-0 sm:col-span-2">
            <span className="text-xs text-text-muted w-28 shrink-0 mt-0.5">注意</span>
            <span className="text-sm text-text-main leading-relaxed">{noticeText}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
