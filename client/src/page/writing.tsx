import i18n from 'i18next';
import _ from 'lodash';
import {useCallback, useContext, useEffect, useState} from "react";
import {Helmet} from "react-helmet";
import {useTranslation} from "react-i18next";
import Loading from 'react-loading';
import {ShowAlertType, useAlert} from '../components/dialog';
import {Checkbox, Input} from "../components/input";
import { DateTimeInput, FlatMetaRow, FlatPanel } from "@rin/ui";
import { client } from "../app/runtime";
import {Cache} from '../utils/cache';
import {useSiteConfig} from "../hooks/useSiteConfig";
import {siteName} from "../utils/constants";
import { ProfileContext } from "../state/profile";
import mermaid from 'mermaid';
import { MarkdownEditor } from '../components/markdown_editor';

function humanizeFeedError(value: string) {
  if (value === "Draft box is full") return i18n.t("draft_full");
  if (value === "File count limit exceeded") return i18n.t("upload.file.count_limit_exceeded");
  if (value === "File size limit exceeded") return i18n.t("upload.file.size_limit_exceeded");
  if (value === "Unknown file attachment") return i18n.t("upload.file.unknown_attachment");
  if (value === "Invalid file attachment") return i18n.t("upload.file.invalid_attachment");
  return value;
}

async function publish({
  title,
  alias,
  loginRequired,
  content,
  summary,
  tags,
  draft,
  createdAt,
  onCompleted,
  showAlert
}: {
  title: string;
  loginRequired: boolean;
  content: string;
  summary: string;
  tags: string[];
  draft: boolean;
  alias?: string;
  createdAt?: Date;
  onCompleted?: () => void;
  showAlert: ShowAlertType;
}) {
  const t = i18n.t
  const { data, error } = await client.feed.create(
    {
      title,
      alias,
      content,
      summary,
      tags,
      draft,
      loginRequired,
      createdAt: createdAt?.toISOString(),
    }
  );
  if (onCompleted) {
    onCompleted();
  }
  if (error) {
    showAlert(humanizeFeedError(error.value as string));
  }
  if (data) {
    showAlert(draft ? t("draft_saved") : t("publish.success"), () => {
      Cache.with().clear();
      window.location.href = draft ? "/draft/" + data.insertedId : "/feed/" + data.insertedId;
    });
  }
}

async function update({
  id,
  title,
  alias,
  content,
  summary,
  tags,
  loginRequired,
  draft,
  createdAt,
  editReason,
  onCompleted,
  showAlert
}: {
  id: number;
  loginRequired: boolean;
  title?: string;
  alias?: string;
  content?: string;
  summary?: string;
  tags?: string[];
  draft?: boolean;
  createdAt?: Date;
  editReason?: string;
  onCompleted?: () => void;
  showAlert: ShowAlertType;
}) {
  const t = i18n.t
  const { error } = await client.feed.update(
    id,
    {
      title,
      alias,
      content,
      summary,
      tags,
      draft,
      loginRequired,
      createdAt: createdAt?.toISOString(),
      editReason,
    }
  );
  if (onCompleted) {
    onCompleted();
  }
  if (error) {
    showAlert(humanizeFeedError(error.value as string));
  } else {
    showAlert(draft ? t("draft_saved") : t("update.success"), () => {
      Cache.with(id).clear();
      window.location.href = draft ? "/draft/" + id : "/feed/" + id;
    });
  }
}

// 写作页面
export function WritingPage({ id }: { id?: number }) {
  const { t } = useTranslation();
  const siteConfig = useSiteConfig();
  const profile = useContext(ProfileContext);
  const isAdmin = Boolean(profile?.permission);
  const cache = Cache.with(id);
  const [title, setTitle] = cache.useCache("title", "");
  const [summary, setSummary] = cache.useCache("summary", "");
  const [tags, setTags] = cache.useCache("tags", "");
  const [alias, setAlias] = cache.useCache("alias", "");
  const [loginRequired, setLoginRequired] = useState(false);
  const [content, setContent] = cache.useCache("content", "");
  const [createdAt, setCreatedAt] = useState<Date | undefined>(new Date());
  const [editReason, setEditReason] = useState("");
  const [publishing, setPublishing] = useState(false)
  const { showAlert, AlertUI } = useAlert()
  async function submitFeed(asDraft: boolean) {
    if (publishing) return;
    if (!title) {
      showAlert(t("title_empty"))
      return;
    }
    if (!content) {
      showAlert(t("content.empty"))
      return;
    }
    const tagsplit =
      tags
        .split("#")
        .filter((tag) => tag !== "")
        .map((tag) => tag.trim()) || [];
    // 普通用户存新草稿时检查草稿箱是否已满（最多 3 篇）
    if (asDraft && id === undefined && !isAdmin) {
      const { data } = await client.feed.list({ type: "draft", limit: 1 });
      if (data && data.size >= 3) {
        showAlert(t("draft_full"))
        return;
      }
    }
    if (id !== undefined) {
      setPublishing(true)
      update({
        id,
        title,
        content,
        summary,
        alias,
        tags: tagsplit,
        draft: asDraft,
        loginRequired,
        createdAt,
        editReason,
        onCompleted: () => {
          setPublishing(false)
        },
        showAlert
      });
    } else {
      setPublishing(true)
      publish({
        title,
        content,
        summary,
        tags: tagsplit,
        draft: asDraft,
        alias,
        loginRequired,
        createdAt,
        onCompleted: () => {
          setPublishing(false)
        },
        showAlert
      });
    }
  }

  useEffect(() => {
    if (id) {
      client.feed
        .get(id)
        .then(({ data }) => {
          if (data) {
            if (title == "" && data.title) setTitle(data.title);
            if (tags == "" && data.hashtags)
              setTags(data.hashtags.map(({ name }: {name: string}) => `#${name}`).join(" "));
            if (alias == "" && (data as any).alias) setAlias((data as any).alias);
            if (content == "") setContent(data.content);
            if (summary == "") setSummary((data as any).summary || "");
            setLoginRequired((data as any).loginRequired === 1);
            setCreatedAt(new Date(data.createdAt));
          }
        });
    }
  }, []);
  const debouncedUpdate = useCallback(
    _.debounce(() => {
      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
      });
      mermaid.run({
        suppressErrors: true,
        nodes: document.querySelectorAll("pre.mermaid_default")
      }).then(()=>{
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
        });
        mermaid.run({
          suppressErrors: true,
          nodes: document.querySelectorAll("pre.mermaid_dark")
        });
      })
    }, 100),
    []
  );
  useEffect(() => {
    debouncedUpdate();
  }, [content, debouncedUpdate]);
  function PublishButton({ className }: { className?: string }) {
    return (
      <div className={`flex items-center gap-2 ${className ?? ""}`}>
        <button
          onClick={() => submitFeed(false)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-theme px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-theme-hover active:bg-theme-active disabled:cursor-not-allowed disabled:opacity-60"
          disabled={publishing}
        >
          {publishing && <Loading type="spin" height={16} width={16} />}
          <span>{t('publish.title')}</span>
        </button>
        <button
          onClick={() => submitFeed(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-transparent px-5 py-3 text-sm font-medium t-primary transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/5"
          disabled={publishing}
        >
          <span>{t('draft_save')}</span>
        </button>
      </div>
    );
  }

  function MetaInput({ className }: { className?: string }) {
    return (
        <FlatPanel className={className}>
          <div className="flex flex-row gap-4 border-b border-black/5 pb-5 dark:border-white/5 items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-theme/70">{t('writing')}</p>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                {id !== undefined ? t("update.title") : t("publish.title")}
              </p>
            </div>
            <PublishButton className="w-auto" />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <Input
                id={id}
                value={title}
                setValue={setTitle}
                placeholder={t("title")}
                variant="flat"
                className="text-base"
              />
            </div>
            <Input
              id={id}
              value={summary}
              setValue={setSummary}
              placeholder={t("summary")}
              variant="flat"
              className="lg:col-span-2"
            />
            {isAdmin && <Input
              id={id}
              value={alias}
              setValue={setAlias}
              placeholder={t("alias")}
              variant="flat"
            />}
            <Input
              id={id}
              value={tags}
              setValue={setTags}
              placeholder={t("tags")}
              variant="flat"
              className="lg:col-span-2"
            />
            {id !== undefined && (
              <Input
                id={id}
                value={editReason}
                setValue={setEditReason}
                placeholder={t("edit_history.reason_placeholder")}
                variant="flat"
                className="lg:col-span-2"
              />
            )}
          </div>

          <div className="mt-5 grid gap-2 sm:gap-3 sm:grid-cols-2">
            <FlatMetaRow
              className="cursor-pointer rounded-none border-0 bg-transparent px-0 py-2 sm:rounded-2xl sm:border sm:bg-secondary sm:px-4 sm:py-3"
              onClick={() => setLoginRequired(!loginRequired)}
            >
              <p className="min-w-0 whitespace-nowrap text-[clamp(0.75rem,1.1vw,0.875rem)]">{t('visible.login_only')}</p>
              <Checkbox
                id="loginRequired"
                value={loginRequired}
                setValue={setLoginRequired}
                placeholder={t('visible.login_only')}
              />
            </FlatMetaRow>
            {isAdmin && (
              <FlatMetaRow className="gap-3 rounded-none border-0 bg-transparent px-0 py-2 sm:rounded-2xl sm:border sm:bg-secondary sm:px-4 sm:py-3">
                <p className="mr-2 whitespace-nowrap">
                  {t('created_at')}
                </p>
                <DateTimeInput value={createdAt} onChange={setCreatedAt} className="w-full max-w-[16rem]" />
              </FlatMetaRow>
            )}
          </div>
        </FlatPanel>
    )
  }

  return (
    <>
      <Helmet>
        <title>{`${t('writing')} - ${siteConfig.name}`}</title>
        <meta property="og:site_name" content={siteName} />
        <meta property="og:title" content={t('writing')} />
        <meta property="og:image" content={siteConfig.avatar} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={document.URL} />
      </Helmet>
      <div className="mt-2 flex flex-col gap-4 t-primary sm:gap-6">
        {MetaInput({ className: "p-4 sm:p-5 md:p-6" })}

        <FlatPanel className="overflow-hidden p-0">
          <MarkdownEditor content={content} setContent={setContent} height='680px' allowFileUpload />
        </FlatPanel>
      </div>
      <AlertUI />
    </>
  );
}
