import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Tag } from "../api/client";
import { client } from "../app/runtime";

export const MAX_FEED_TAGS = 10;

export function normalizeTagName(value: string) {
  return value.trim().replace(/^#+/, "").trim();
}

export function parseTagsFromCache(value: string) {
  const text = value.trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return uniqueTags(parsed.map((item) => normalizeTagName(String(item))));
    }
  } catch {
    // Older drafts stored tags as "#tag1 #tag2".
  }

  return uniqueTags(
    text
      .split("#")
      .map((tag) => normalizeTagName(tag))
      .filter(Boolean),
  );
}

export function formatTagsForCache(tags: string[]) {
  return JSON.stringify(uniqueTags(tags.map(normalizeTagName)));
}

function uniqueTags(tags: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }

  return result;
}

export function TagSelector({
  value,
  setValue,
  className,
  onInvalid,
}: {
  value: string;
  setValue: (value: string) => void;
  className?: string;
  onInvalid?: (message: string) => void;
}) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [knownTags, setKnownTags] = useState<Tag[]>([]);
  const selectedTags = useMemo(() => parseTagsFromCache(value), [value]);
  const normalizedQuery = normalizeTagName(query);

  useEffect(() => {
    let ignore = false;
    client.tag.list().then(({ data }) => {
      if (!ignore && data) {
        setKnownTags(data);
      }
    });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const selectedSet = useMemo(() => new Set(selectedTags), [selectedTags]);
  const filteredTags = useMemo(() => {
    const normalizedQueryLower = normalizedQuery.toLowerCase();
    return knownTags
      .filter((tag) => !selectedSet.has(tag.name))
      .filter((tag) => {
        if (!normalizedQueryLower) return true;
        return tag.name.toLowerCase().includes(normalizedQueryLower);
      })
      .slice(0, 30);
  }, [knownTags, normalizedQuery, selectedSet]);

  const canCreate =
    normalizedQuery.length > 0 &&
    !selectedSet.has(normalizedQuery) &&
    !knownTags.some((tag) => tag.name === normalizedQuery);
  const atLimit = selectedTags.length >= MAX_FEED_TAGS;

  function commitTags(tags: string[]) {
    setValue(formatTagsForCache(tags.slice(0, MAX_FEED_TAGS)));
  }

  function addTag(tag: string) {
    const normalized = normalizeTagName(tag);
    if (!normalized) return;
    if (selectedSet.has(normalized)) {
      setQuery("");
      return;
    }
    if (atLimit) {
      onInvalid?.(t("tag_selector.max_exceeded", { count: MAX_FEED_TAGS }));
      return;
    }
    commitTags([...selectedTags, normalized]);
    setQuery("");
  }

  function removeTag(tag: string) {
    commitTags(selectedTags.filter((selectedTag) => selectedTag !== tag));
  }

  return (
    <div ref={rootRef} className={`relative w-full ${className ?? ""}`}>
      <div
        role="button"
        tabIndex={0}
        className="flex min-h-11 w-full cursor-text items-center gap-2 rounded-xl border border-black/10 bg-w px-3 py-2 t-primary transition-colors focus-within:border-black/20 focus-within:outline-none focus-within:ring-2 focus-within:ring-theme/10 dark:border-white/10 dark:focus-within:border-white/20"
        onClick={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-theme/10 px-2.5 py-1 text-sm text-theme"
            >
              <span className="min-w-0 truncate">#{tag}</span>
              <button
                type="button"
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-theme/70 transition-colors hover:bg-theme/15 hover:text-theme"
                aria-label={t("tag_selector.remove", { tag })}
                onClick={(event) => {
                  event.stopPropagation();
                  removeTag(tag);
                }}
              >
                <i className="ri-close-line text-sm" />
              </button>
            </span>
          ))}
          {selectedTags.length === 0 ? (
            <span className="px-1 py-1 text-sm text-neutral-400 dark:text-neutral-500">{t("tags")}</span>
          ) : null}
        </div>
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/5"
          aria-label={t("tag_selector.open")}
          onClick={(event) => {
            event.stopPropagation();
            setIsOpen((current) => !current);
          }}
        >
          <i className={`ri-arrow-down-s-line text-lg transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 rounded-xl border border-black/10 bg-w p-3 shadow-lg dark:border-white/10">
          <div className="flex gap-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("tag_selector.search")}
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-w px-3 py-2 text-sm t-primary outline-none ring-0 placeholder:text-neutral-400 focus:border-black/20 dark:border-white/10 dark:placeholder:text-neutral-500 dark:focus:border-white/20"
              onKeyDown={(event) => {
                if (event.key === "Enter" && normalizedQuery) {
                  event.preventDefault();
                  addTag(normalizedQuery);
                }
              }}
            />
            <button
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-theme text-white transition-colors hover:bg-theme-hover disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!normalizedQuery || (!canCreate && selectedSet.has(normalizedQuery)) || atLimit}
              title={t("tag_selector.create")}
              onClick={() => addTag(normalizedQuery)}
            >
              <i className="ri-add-line text-lg" />
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between px-1 text-xs text-neutral-500 dark:text-neutral-400">
            <span>{t("tag_selector.selected_count", { count: selectedTags.length, max: MAX_FEED_TAGS })}</span>
            {atLimit ? <span className="text-theme">{t("tag_selector.max_hint", { count: MAX_FEED_TAGS })}</span> : null}
          </div>

          <div className="mt-3 max-h-64 overflow-auto">
            {canCreate && !atLimit ? (
              <button
                type="button"
                className="mb-1 flex w-full items-center justify-between rounded-lg border border-dashed border-black/10 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-200 dark:hover:bg-white/5"
                onClick={() => addTag(normalizedQuery)}
              >
                <span className="min-w-0 truncate">{t("tag_selector.create_named", { tag: `#${normalizedQuery}` })}</span>
                <i className="ri-add-line ml-3 shrink-0 text-lg text-theme" />
              </button>
            ) : null}

            {filteredTags.length === 0 ? (
              <p className="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400">{t("tag_selector.empty")}</p>
            ) : null}

            {filteredTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-white/5"
                disabled={atLimit}
                onClick={() => addTag(tag.name)}
              >
                <span className="min-w-0 truncate">#{tag.name}</span>
                <span className="ml-3 shrink-0 text-xs text-neutral-400">
                  {t("article.total_short$count", { count: (tag as Tag & { feeds?: number }).feeds ?? tag.count ?? 0 })}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
