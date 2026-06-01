import { SettingsBadge, SettingsCard, SettingsCardBody, SettingsCardHeader } from "@rin/ui";
import type { ConfigHealthCell, ConfigHealthItem } from "../api/client";
import { client } from "../app/runtime";
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import ReactLoading from "react-loading";
import { useSiteConfig } from "../hooks/useSiteConfig";

function renderHealthText(
  t: ReturnType<typeof useTranslation>["t"],
  text: ConfigHealthItem["title"],
) {
  return t(text.key, text.values);
}

function cellToneClass(tone?: ConfigHealthCell["tone"]) {
  if (tone === "red") return "text-red-600 dark:text-red-400 font-semibold";
  if (tone === "amber") return "text-amber-600 dark:text-amber-400 font-medium";
  return "";
}

function HealthTable({ table }: { table: NonNullable<ConfigHealthItem["table"]> }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400">
            {table.columns.map((col, i) => (
              <th key={`col-${i}`} className="px-2 py-1.5 font-medium whitespace-nowrap">
                {renderHealthText(t, col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={`row-${ri}`} className="border-b border-neutral-100 dark:border-neutral-800">
              {row.map((cell, ci) => {
                const content = cell.text ? renderHealthText(t, cell.text) : cell.raw ?? "";
                return (
                  <td key={`cell-${ri}-${ci}`} className={`px-2 py-1.5 align-top ${cellToneClass(cell.tone)}`}>
                    {cell.href ? (
                      <a
                        href={cell.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#0686c8] dark:text-[#2590f1] hover:underline break-all"
                      >
                        {content}
                      </a>
                    ) : (
                      <span className="break-all">{content}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HealthCard({ item }: { item: ConfigHealthItem }) {
  const { t } = useTranslation();
  const tone = item.status;
  const badgeTone = item.status === "success" ? "success" : item.status === "warning" ? "warning" : "neutral";
  const badgeLabel =
    item.status === "success"
      ? t("health.status.success")
      : item.status === "warning"
        ? t("health.status.warning")
        : t("health.status.danger");

  return (
    <SettingsCard tone={tone}>
      <SettingsCardHeader
        title={renderHealthText(t, item.title)}
        description={renderHealthText(t, item.summary)}
        badge={<SettingsBadge tone={badgeTone}>{badgeLabel}</SettingsBadge>}
      />
      <SettingsCardBody>
        <div className="space-y-3 text-sm text-neutral-600 dark:text-neutral-300">
          <p>{renderHealthText(t, item.impact)}</p>
          {item.suggestion ? <p className="text-neutral-500 dark:text-neutral-400">{renderHealthText(t, item.suggestion)}</p> : null}
          {item.details?.length ? (
            <ul className="space-y-1 text-xs text-neutral-500 dark:text-neutral-400">
              {item.details.map((detail) => (
                <li key={`${detail.key}-${JSON.stringify(detail.values ?? {})}`}>{renderHealthText(t, detail)}</li>
              ))}
            </ul>
          ) : null}
          {item.table?.rows.length ? <HealthTable table={item.table} /> : null}
        </div>
      </SettingsCardBody>
    </SettingsCard>
  );
}

export function HealthPage() {
  const { t } = useTranslation();
  const siteConfig = useSiteConfig();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ConfigHealthItem[]>([]);
  const [summary, setSummary] = useState<Record<"success" | "warning" | "danger", number>>({ success: 0, warning: 0, danger: 0 });
  const [generatedAt, setGeneratedAt] = useState<string>("");

  useEffect(() => {
    client.config
      .getHealth()
      .then(({ data, error }) => {
        if (error) {
          setError(error.value);
          return;
        }
        if (data) {
          setItems(data.items);
          setSummary(data.summary);
          setGeneratedAt(data.generatedAt);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const orderedItems = useMemo(() => {
    const score = { danger: 0, warning: 1, success: 2 } as const;
    return [...items].sort((left, right) => score[left.status] - score[right.status]);
  }, [items]);

  return (
    <div className="flex w-full flex-col gap-4">
      <Helmet>
        <title>{`${t("health.title")} - ${siteConfig.name}`}</title>
      </Helmet>

      <div className="grid gap-4 md:grid-cols-3">
        <SettingsCard tone="success">
          <SettingsCardHeader title={String(summary.success)} description={t("health.summary.success")} />
        </SettingsCard>
        <SettingsCard tone="warning">
          <SettingsCardHeader title={String(summary.warning)} description={t("health.summary.warning")} />
        </SettingsCard>
        <SettingsCard tone="danger">
          <SettingsCardHeader title={String(summary.danger)} description={t("health.summary.danger")} />
        </SettingsCard>
      </div>

      {generatedAt ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {t("health.generated_at", { date: new Date(generatedAt).toLocaleString() })}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-3 py-8 text-sm text-neutral-500 dark:text-neutral-400">
          <ReactLoading width="1.25em" height="1.25em" type="spin" color="#FC466B" />
          <span>{t("health.loading")}</span>
        </div>
      ) : null}

      {error ? (
        <SettingsCard tone="danger">
          <SettingsCardHeader title={t("health.load_failed")} description={error} />
        </SettingsCard>
      ) : null}

      {!loading && !error ? (
        <div className="space-y-4">
          {orderedItems.map((item) => (
            <HealthCard key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
