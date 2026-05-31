import type { Comment, Feed, FeedEditHistory } from "@rin/api";
import { useContext, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import ReactModal from "react-modal";
import Popup from "reactjs-popup";
import { Link, useLocation } from "wouter";
import { useAlert, useConfirm } from "../components/dialog";
import { HashTag } from "../components/hashtag";
import { Waiting } from "../components/loading";
import { Markdown } from "../components/markdown";
import { client } from "../app/runtime";
import { ClientConfigContext } from "../state/config";
import { ProfileContext } from "../state/profile";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { siteName } from "../utils/constants";
import { timeago } from "../utils/timeago";
import { Button } from "../components/button";
import { Tips } from "../components/tips";
import mermaid from "mermaid";
import { AdjacentSection } from "../components/adjacent_feed.tsx";
import { stripImageUrlMetadata } from "../utils/image-upload";
import { EditHistoryModal } from "../components/edit-history-modal";
import { UserAvatarLink } from "../components/user-hover-card";

function extractFirstMarkdownImageUrl(content: string) {
  const match = /!\[.*?\]\((\S+?)(?:\s+"[^"]*")?\)/.exec(content);
  if (!match) {
    return undefined;
  }

  return stripImageUrlMetadata(match[1]);
}

export function FeedPage({ id, TOC, clean }: { id: string, TOC: () => JSX.Element, clean: (id: string) => void }) {
  const { t } = useTranslation();
  const siteConfig = useSiteConfig();
  const profile = useContext(ProfileContext);
  const [feed, setFeed] = useState<Feed>();
  const [error, setError] = useState<string>();
  const [headImage, setHeadImage] = useState<string>();
  const ref = useRef("");
  const [, setLocation] = useLocation();
  const { showAlert, AlertUI } = useAlert();
  const { showConfirm, ConfirmUI } = useConfirm();
  const [top, setTop] = useState<number>(0);
  const config = useContext(ClientConfigContext);
  const counterEnabled = config.getBoolean('counter.enabled');
  const hasAISummary = Boolean(feed?.ai_summary?.trim());
  const showAISummaryState = feed?.ai_summary_status === "pending" || feed?.ai_summary_status === "processing" || feed?.ai_summary_status === "failed";

  // Edit history state
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [editHistory, setEditHistory] = useState<FeedEditHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  function deleteFeed() {
    // Confirm
    showConfirm(
      t("article.delete.title"),
      t("article.delete.confirm"),
      () => {
        if (!feed) return;
        client.feed
          .delete(feed.id)
          .then(({ error }) => {
            if (error) {
              showAlert(error.value as string);
            } else {
              showAlert(t("delete.success"));
              setLocation("/");
            }
          });
      })
  }
  function topFeed() {
    const isUnTop = !(top > 0)
    const topNew = isUnTop ? 1 : 0;
    // Confirm
    showConfirm(
      isUnTop ? t("article.top.title") : t("article.untop.title"),
      isUnTop ? t("article.top.confirm") : t("article.untop.confirm"),
      () => {
        if (!feed) return;
        client.feed
          .setTop(feed.id, topNew)
          .then(({ error }) => {
            if (error) {
              showAlert(error.value as string);
            } else {
              showAlert(isUnTop ? t("article.top.success") : t("article.untop.success"));
              setTop(topNew);
            }
          });
      })
  }

  function loadEditHistory() {
    if (!feed) return;
    setLoadingHistory(true);
    fetch(`/api/feed/${feed.id}/history`)
      .then(res => res.json())
      .then(data => {
        setEditHistory(data.data || []);
        setLoadingHistory(false);
      })
      .catch(err => {
        console.error('Failed to load edit history:', err);
        setEditHistory([]);
        setLoadingHistory(false);
      });
  }

  function openEditHistory() {
    setShowEditHistory(true);
    loadEditHistory();
  }
  useEffect(() => {
    if (ref.current == id) return;
    setFeed(undefined);
    setError(undefined);
    setHeadImage(undefined);
    client.feed
      .get(id)
      .then(({ data, error }) => {
        if (error) {
          setError(error.value as string);
        } else if (data && typeof data !== "string") {
          setTimeout(() => {
            setFeed(data as any);
            setTop(data.top || 0);
            const headImageUrl = extractFirstMarkdownImageUrl(data.content);
            if (headImageUrl) {
              setHeadImage(headImageUrl);
            }
            clean(id);
          }, 0);
        }
      });
    ref.current = id;
  }, [id]);
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
    });
    mermaid.run({
      suppressErrors: true,
      nodes: document.querySelectorAll("pre.mermaid_default")
    }).then(() => {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
      });
      mermaid.run({
        suppressErrors: true,
        nodes: document.querySelectorAll("pre.mermaid_dark")
      });
    })
  }, [feed]);

  return (
    <Waiting for={feed || error}>
      {feed && (
        <Helmet>
          <title>{`${feed.title ?? "Unnamed"} - ${siteConfig.name}`}</title>
          <meta property="og:site_name" content={siteName} />
          <meta property="og:title" content={feed.title ?? ""} />
          <meta property="og:image" content={headImage ?? siteConfig.avatar} />
          <meta property="og:type" content="article" />
          <meta property="og:url" content={document.URL} />
          <meta
            name="og:description"
            content={
              feed.content.length > 200
                ? feed.content.substring(0, 200)
                : feed.content
            }
          />
          <meta name="author" content={feed.user.username} />
          <meta
            name="keywords"
            content={feed.hashtags.map(({ name }) => name).join(", ")}
          />
          <meta
            name="description"
            content={
              feed.content.length > 200
                ? feed.content.substring(0, 200)
                : feed.content
            }
          />
        </Helmet>
      )}
      <div className="w-full flex flex-row justify-center ani-show">
        {error && (
          <>
            <div className="flex flex-col wauto rounded-2xl bg-w m-2 p-6 items-center justify-center space-y-2">
              <h1 className="text-xl font-bold t-primary">{error}</h1>
              {error === "Not found" && id === "about" && (
                <Tips value={t("about.notfound")} />
              )}
              <Button
                title={t("index.back")}
                onClick={() => (window.location.href = "/")}
              />
            </div>
          </>
        )}
        {feed && !error && (
          <>
            <div className="xl:w-64" />
            <main className="wauto">
              <article
                className="rounded-2xl bg-w m-2 px-6 py-4"
                aria-label={feed.title ?? "Unnamed"}
              >
                <div className="flex justify-between">
                  <div>
                    <div className="mt-1 mb-1 flex gap-1">
                      <p
                        className="text-gray-400 text-[12px]"
                        title={new Date(feed.createdAt).toLocaleString()}
                      >
                        {t("feed_card.published$time", {
                          time: timeago(feed.createdAt),
                        })}
                      </p>

                      {feed.createdAt !== feed.updatedAt && (
                        <p
                          className="text-gray-400 text-[12px]"
                          title={new Date(feed.updatedAt).toLocaleString()}
                        >
                          {t("feed_card.edited$time", {
                            time: timeago(feed.updatedAt),
                          })}
                        </p>
                      )}
                    </div>
                    {counterEnabled && <p className='text-[12px] text-gray-400 font-normal link-line'>
                      <span> {t("count.pv")} </span>
                      <span>
                        {feed.pv}
                      </span>
                      <span> |</span>
                      <span> {t("count.uv")} </span>
                      <span>
                        {feed.uv}
                      </span>
                    </p>}
                    <div className="flex flex-row items-center">
                      <h1 className="text-2xl font-bold t-primary break-all">
                        {feed.title}
                      </h1>
                      <div className="flex-1 w-0" />
                    </div>
                  </div>
                  <div className="pt-2">
                    {(profile?.permission || profile?.id === feed.user.id) && (
                      <div className="flex gap-2">
                        <button
                          aria-label={top > 0 ? t("untop.title") : t("top.title")}
                          onClick={topFeed}
                          className={`flex-1 flex flex-col items-end justify-center px-2 py rounded-full transition ${top > 0 ? "bg-theme text-white hover:bg-theme-hover active:bg-theme-active" : "bg-secondary bg-button dark:text-neutral-400"}`}
                        >
                          <i className="ri-skip-up-line" />
                        </button>
                        {feed.createdAt !== feed.updatedAt && (
                          <button
                            aria-label={t("edit_history.view")}
                            onClick={openEditHistory}
                            className="flex-1 flex flex-col items-end justify-center px-2 py bg-secondary bg-button rounded-full transition"
                          >
                            <i className="ri-history-line dark:text-neutral-400" />
                          </button>
                        )}
                        <Link
                          aria-label={t("edit")}
                          href={`/admin/writing/${feed.id}`}
                          className="flex-1 flex flex-col items-end justify-center px-2 py bg-secondary bg-button rounded-full transition"
                        >
                          <i className="ri-edit-2-line dark:text-neutral-400" />
                        </Link>
                        <button
                          aria-label={t("delete.title")}
                          onClick={deleteFeed}
                          className="flex-1 flex flex-col items-end justify-center px-2 py bg-secondary bg-button rounded-full transition"
                        >
                          <i className="ri-delete-bin-7-line text-red-500" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {(hasAISummary || showAISummaryState) && (
                  <div className="my-4 p-4 rounded-xl bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-100 dark:border-purple-800/30">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <i className="ri-sparkling-2-fill text-purple-500" />
                        <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                          {t('ai_summary.title')}
                        </span>
                      </div>
                      {showAISummaryState ? (
                        <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-medium text-purple-700 dark:bg-white/10 dark:text-purple-300">
                          {t(`ai_summary.status.${feed.ai_summary_status}`)}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm t-secondary leading-relaxed whitespace-pre-wrap">
                      {hasAISummary ? feed.ai_summary : t(`ai_summary.message.${feed.ai_summary_status}`)}
                    </p>
                    {feed.ai_summary_status === "failed" && feed.ai_summary_error ? (
                      <p className="mt-2 text-xs text-rose-600 dark:text-rose-300 whitespace-pre-wrap">
                        {feed.ai_summary_error}
                      </p>
                    ) : null}
                  </div>
                )}
                <Markdown content={feed.content} />
                <div className="mt-6 flex flex-col gap-2">
                  {feed.hashtags.length > 0 && (
                    <div className="flex flex-row flex-wrap gap-x-2">
                      {feed.hashtags.map(({ name }, index) => (
                        <HashTag key={index} name={name} />
                      ))}
                    </div>
                  )}
                  <div className="flex flex-row items-center justify-between">
                    <div className="flex flex-row items-center gap-2">
                      <UserAvatarLink user={feed.user} className="h-8 w-8 rounded-full" />
                      <span className="text-gray-400 text-sm">
                        {feed.user.username}
                      </span>
                    </div>
                    <LikeBookmarkBar feedId={feed.id} />
                  </div>
                </div>
              </article>
              <AdjacentSection id={id} setError={setError} />
              {feed && <Comments id={`${feed.id}`} />}
              <div className="h-16" />
            </main>
            <div className="w-80 hidden lg:block relative">
              <div
                className={`start-0 end-0 top-[5.5rem] sticky`}
              >
                <TOC />
              </div>
            </div>
          </>
        )}
      </div>
      <AlertUI />
      <ConfirmUI />
      {feed && (
        <EditHistoryModal
          isOpen={showEditHistory}
          onClose={() => setShowEditHistory(false)}
          feedId={feed.id}
          history={editHistory}
          loading={loadingHistory}
        />
      )}
    </Waiting>
  );
}

function LikeBookmarkBar({ feedId }: { feedId: number }) {
  const profile = useContext(ProfileContext);
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    client.interaction.get(feedId).then(({ data }) => {
      if (data) { setLikes(data.likes); setLiked(data.liked); setBookmarked(data.bookmarked); }
    });
  }, [feedId]);

  if (!profile) return null;

  async function toggleLike() {
    const { data } = await client.interaction.toggleLike(feedId);
    if (data) { setLiked(data.liked); setLikes(l => data.liked ? l + 1 : l - 1); }
  }
  async function toggleBookmark() {
    const { data } = await client.interaction.toggleBookmark(feedId);
    if (data) setBookmarked(data.bookmarked);
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={toggleLike} className={`flex items-center gap-1 text-sm transition-colors ${liked ? "text-theme" : "text-gray-400 hover:text-theme"}`}>
        <i className={liked ? "ri-heart-fill" : "ri-heart-line"} />
        {likes > 0 && <span>{likes}</span>}
      </button>
      <button onClick={toggleBookmark} className={`flex items-center gap-1 text-sm transition-colors ${bookmarked ? "text-theme" : "text-gray-400 hover:text-theme"}`}>
        <i className={bookmarked ? "ri-bookmark-fill" : "ri-bookmark-line"} />
      </button>
    </div>
  );
}

export function TOCHeader({ TOC }: { TOC: () => JSX.Element }) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <div className="shrink-0 lg:hidden">
      <button
        onClick={() => setIsOpened(true)}
        className="w-10 h-10 rounded-full flex flex-row items-center justify-center"
      >
        <i className="ri-menu-2-line text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 ri-lg md:ri-sm md:t-secondary"></i>
      </button>
      <ReactModal
        isOpen={isOpened}
        style={{
          content: {
            top: "50%",
            left: "50%",
            right: "auto",
            bottom: "auto",
            marginRight: "-50%",
            transform: "translate(-50%, -50%)",
            padding: "0",
            border: "none",
            borderRadius: "16px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            background: "none",
          },
          overlay: {
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 1000,
          },
        }}
        onRequestClose={() => setIsOpened(false)}
      >
        <div className="w-[80vw] sm:w-[60vw] lg:w-[40vw] overflow-clip relative t-primary">
          <TOC />
        </div>
      </ReactModal>
    </div>
  );
}

function CommentInput({
  id,
  onRefresh,
  parentId,
  replyToName,
  onCancel,
}: {
  id: string;
  onRefresh: () => void;
  parentId?: number;
  replyToName?: string;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestContact, setGuestContact] = useState("");
  const [error, setError] = useState("");
  const { showAlert, AlertUI } = useAlert();
  const profile = useContext(ProfileContext);
  const [, setLocation] = useLocation();
  const config = useContext(ClientConfigContext);
  // guest comments enabled by default; admin can disable via client config `comment.guest.enabled=false`
  const rawGuest = config.get('comment.guest.enabled');
  const guestEnabled = rawGuest !== false && rawGuest !== 'false';
  function errorHumanize(error: string) {
    if (error === "Unauthorized") return t("login.required");
    else if (error === "Content is required") return t("comment.empty");
    else if (error === "Guest name is required") return t("comment.guest_name_required");
    else if (error === "Parent comment has been deleted") return t("comment.parent_deleted");
    return error;
  }
  function submit() {
    const baseBody = {
      content,
      ...(parentId ? { parentId } : {}),
    };

    if (profile) {
      client.comment
        .create(parseInt(id), baseBody)
        .then(({ error }) => {
          if (error) {
            setError(errorHumanize(error.value as string));
          } else {
            setContent("");
            setError("");
            showAlert(t("comment.success"), () => {
              onRefresh();
              onCancel?.();
            });
          }
        });
    } else if (guestEnabled) {
      if (!guestName.trim()) {
        setError(t("comment.guest_name_required"));
        return;
      }
      client.comment
        .create(parseInt(id), {
          ...baseBody,
          guestName: guestName.trim(),
          guestContact: guestContact.trim() || undefined,
        })
        .then(({ error }) => {
          if (error) {
            setError(errorHumanize(error.value as string));
          } else {
            setContent("");
            setGuestName("");
            setGuestContact("");
            setError("");
            showAlert(t("comment.success"), () => {
              onRefresh();
              onCancel?.();
            });
          }
        });
    } else {
      setLocation('/login');
    }
  }
  return (
    <div className={`w-full t-primary items-end flex flex-col ${parentId ? "" : "rounded-2xl bg-w p-6"}`}>
      <div className="flex flex-col w-full items-start mb-4">
        <label htmlFor={parentId ? `comment-reply-${parentId}` : "comment"}>
          {replyToName ? t("comment.replying_to$name", { name: replyToName }) : t("comment.title")}
        </label>
      </div>
      {profile ? (<>
        <textarea
          id={parentId ? `comment-reply-${parentId}` : "comment"}
          placeholder={t("comment.placeholder.title")}
          className="bg-w w-full h-24 rounded-lg"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="mt-4 flex gap-2">
          {onCancel && (
            <button
              className="bg-secondary bg-button t-secondary px-4 py-2 rounded-full"
              onClick={onCancel}
            >
              {t("comment.cancel_reply")}
            </button>
          )}
          <button
            className="bg-theme text-white px-4 py-2 rounded-full"
            onClick={submit}
          >
            {parentId ? t("comment.reply") : t("comment.submit")}
          </button>
        </div>
      </>) : guestEnabled ? (<>
        <input
          type="text"
          placeholder={t("comment.guest_name_placeholder")}
          className="bg-w w-full rounded-lg px-3 py-2 mb-2 border border-gray-200 dark:border-gray-700"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
        />
        <input
          type="text"
          placeholder={t("comment.guest_contact_placeholder")}
          className="bg-w w-full rounded-lg px-3 py-2 mb-2 border border-gray-200 dark:border-gray-700"
          value={guestContact}
          onChange={(e) => setGuestContact(e.target.value)}
        />
        <textarea
          id={parentId ? `comment-reply-${parentId}` : "comment"}
          placeholder={t("comment.placeholder.title")}
          className="bg-w w-full h-24 rounded-lg"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="mt-4 flex gap-2">
          {onCancel && (
            <button
              className="bg-secondary bg-button t-secondary px-4 py-2 rounded-full"
              onClick={onCancel}
            >
              {t("comment.cancel_reply")}
            </button>
          )}
          <button
            className="bg-theme text-white px-4 py-2 rounded-full"
            onClick={submit}
          >
            {parentId ? t("comment.reply") : t("comment.submit")}
          </button>
        </div>
      </>) : (
        <div className="flex flex-row w-full items-center justify-center space-x-2 py-12">
          <button
            className="mt-2 bg-theme text-white px-4 py-2 rounded-full"
            onClick={() => setLocation('/login')}
          >
            {t("login.required")}
          </button>
        </div>
      )}
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      <AlertUI />
    </div>
  );
}

function Comments({ id }: { id: string }) {
  const config = useContext(ClientConfigContext);
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<string>();
  const ref = useRef("");
  const { t } = useTranslation();

  function loadComments() {
    client.comment
      .list(parseInt(id))
      .then(({ data, error }) => {
        if (error) {
          setError(error.value as string);
        } else if (data && Array.isArray(data)) {
          setComments(data as any);
        }
      });
  }
  useEffect(() => {
    if (ref.current == id) return;
    loadComments();
    ref.current = id;
  }, [id]);
  return (
    <>
      {config.getBoolean('comment.enabled') &&
        <div className="m-2 flex flex-col justify-center items-center">
          <CommentInput id={id} onRefresh={loadComments} />
          {error && (
            <>
              <div className="flex flex-col wauto rounded-2xl bg-w t-primary m-2 p-6 items-center justify-center">
                <h1 className="text-xl font-bold t-primary">{error}</h1>
                <button
                  className="mt-2 bg-theme text-white px-4 py-2 rounded-full"
                  onClick={loadComments}
                >
                  {t("reload")}
                </button>
              </div>
            </>
          )}
          {comments.length > 0 && (
            <div className="w-full">
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  feedId={id}
                  comment={comment}
                  onRefresh={loadComments}
                />
              ))}
            </div>
          )}
        </div>
      }
    </>
  );
}

function CommentItem({
  feedId,
  comment,
  onRefresh,
  nested = false,
}: {
  feedId: string;
  comment: Comment;
  onRefresh: () => void;
  nested?: boolean;
}) {
  const { showConfirm, ConfirmUI } = useConfirm();
  const { showAlert, AlertUI } = useAlert();
  const { t } = useTranslation();
  const profile = useContext(ProfileContext);
  const [isReplying, setIsReplying] = useState(false);
  const [likes, setLikes] = useState(comment.likes ?? 0);
  const [liked, setLiked] = useState(comment.liked ?? false);
  const commenterName = comment.user?.username || comment.guestName || t("anonymous");
  const isDeleted = Boolean(comment.deletedAt);

  useEffect(() => {
    setLikes(comment.likes ?? 0);
    setLiked(comment.liked ?? false);
  }, [comment.id, comment.likes, comment.liked]);

  function deleteComment() {
    showConfirm(
      t("delete.comment.title"),
      t("delete.comment.confirm"),
      async () => {
        client.comment
          .delete(comment.id)
          .then(({ error }) => {
            if (error) {
              showAlert(error.value as string);
            } else {
              showAlert(t("delete.success"), () => {
                onRefresh();
              });
            }
          });
      })
  }

  async function toggleLike() {
    if (isDeleted) return;
    const { data, error } = await client.comment.toggleLike(comment.id);
    if (error) {
      showAlert(error.value as string);
      return;
    }

    if (data) {
      setLiked(data.liked);
      setLikes((value) => Math.max(0, value + (data.liked ? 1 : -1)));
    }
  }

  return (
    <div
      id={`comment-${comment.id}`}
      style={{ scrollMarginTop: "var(--header-scroll-offset)" }}
      className={`flex flex-row items-start rounded-xl mt-2 ${nested ? "ml-8" : ""}`}
    >
      <UserAvatarLink
        user={comment.user}
        className={`${nested ? "h-7 w-7" : "h-8 w-8"} rounded-full mt-4`}
      />
      <div className="flex flex-col flex-1 w-0 ml-2 bg-w rounded-xl p-4">
        <div className="flex flex-row">
          <span className="t-primary text-base font-bold">
            {commenterName}
          </span>
          <div className="flex-1 w-0" />
          <span
            title={new Date(comment.createdAt).toLocaleString()}
            className="text-gray-400 text-sm"
          >
            {timeago(comment.createdAt)}
          </span>
        </div>
        <CommentQuote replyTo={comment.replyTo} />
        {isDeleted ? (
          <p className="text-sm italic text-neutral-500 dark:text-neutral-400">{t("comment.deleted")}</p>
        ) : (
          <p className="t-primary break-words">{comment.content}</p>
        )}
        <div className="flex flex-row items-center justify-end gap-2">
          {!isDeleted && profile ? (
            <button
              onClick={toggleLike}
              className={`flex items-center gap-1 px-2 py bg-secondary rounded-full text-sm transition-colors ${liked ? "text-theme" : "t-secondary hover:text-theme"}`}
              aria-label={t("comment.like")}
            >
              <i className={liked ? "ri-heart-fill" : "ri-heart-line"} />
              {likes > 0 && <span>{likes}</span>}
            </button>
          ) : !isDeleted && likes > 0 ? (
            <span className="flex items-center gap-1 px-2 py text-sm t-secondary">
              <i className="ri-heart-line" />
              <span>{likes}</span>
            </span>
          ) : null}
          {!isDeleted && (
            <button
              onClick={() => setIsReplying(true)}
              className="px-2 py bg-secondary rounded-full text-sm t-secondary hover:text-theme"
            >
              {t("comment.reply")}
            </button>
          )}
          {!isDeleted && (profile?.permission || (comment.user && profile?.id == comment.user.id)) && (
            <Popup
              arrow={false}
              trigger={
                <button className="px-2 py bg-secondary rounded-full">
                  <i className="ri-more-fill t-secondary"></i>
                </button>
              }
              position="left center"
            >
              <div className="flex flex-row self-end mr-2">
                <button
                  onClick={deleteComment}
                  aria-label={t("delete.comment.title")}
                  className="px-2 py bg-secondary rounded-full"
                >
                  <i className="ri-delete-bin-2-line t-secondary"></i>
                </button>
              </div>
            </Popup>
          )}
        </div>
        {isReplying && (
          <div className="mt-3">
            <CommentInput
              id={feedId}
              parentId={comment.id}
              replyToName={commenterName}
              onRefresh={onRefresh}
              onCancel={() => setIsReplying(false)}
            />
          </div>
        )}
        {!nested && comment.replies && comment.replies.length > 0 && (
          <div className="mt-2">
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                feedId={feedId}
                comment={reply}
                onRefresh={onRefresh}
                nested
              />
            ))}
          </div>
        )}
      </div>
      <ConfirmUI />
      <AlertUI />
    </div>
  );
}

function CommentQuote({
  replyTo,
}: {
  replyTo?: Comment["replyTo"];
}) {
  const { t } = useTranslation();
  if (!replyTo) return null;

  const quote = replyTo.deleted || !replyTo.content ? (
    <span className="italic">{t("comment.deleted")}</span>
  ) : (
    replyTo.content
  );

  const content = (
    <blockquote className="my-2 border-l-4 border-theme/40 bg-secondary px-3 py-2 text-sm text-neutral-600 transition-colors hover:border-theme dark:text-neutral-300">
      <p className="line-clamp-2 break-words">{quote}</p>
    </blockquote>
  );

  if (!replyTo.id || replyTo.deleted) {
    return content;
  }

  return (
    <a href={`#comment-${replyTo.id}`} className="block">
      {content}
    </a>
  );
}
