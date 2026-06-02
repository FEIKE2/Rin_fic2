import { Link } from "wouter";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { timeago } from "../utils/timeago";
import { HashTag } from "./hashtag";
import { useContext, useEffect, useRef, useState } from "react";
import { drawBlurhashToCanvas } from "../utils/blurhash";
import { parseImageUrlMetadata } from "../utils/image-upload";
import { useImageLoadState } from "../utils/use-image-load-state";
import { type FeedCardVariant, normalizeFeedCardVariant } from "./feed-card-options";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { ProfileContext } from "../state/profile";
import { stripMarkdown } from "../utils/markdown-text";

function FeedCardImage({ src }: { src: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { src: cleanSrc, blurhash, width, height } = parseImageUrlMetadata(src);
    const { failed, imageRef, loaded, onError, onLoad } = useImageLoadState(cleanSrc);
    const aspectRatio = width && height ? `${width} / ${height}` : undefined;

    useEffect(() => {
        if (!blurhash || !canvasRef.current) return;
        try {
            drawBlurhashToCanvas(canvasRef.current, blurhash);
        } catch (error) {
            console.error("Failed to render blurhash", error);
        }
    }, [blurhash]);

    return (
        <div className="relative mb-2 flex max-h-80 w-full flex-row items-center overflow-hidden rounded-xl" style={{ aspectRatio }}>
            {blurhash && !loaded ? (
                <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover blur-sm" />
            ) : null}
            <img
                ref={imageRef}
                src={cleanSrc}
                alt=""
                width={width}
                height={height}
                onLoad={onLoad}
                onError={onError}
                className={`absolute inset-0 h-full w-full object-cover object-center hover:scale-105 translation duration-300 ${blurhash && (!loaded || failed) ? "opacity-0" : "opacity-100"}`}
            />
        </div>
    );
}

function formatStatValue(value: number) {
    return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export type FeedCardProps = {
    id: string;
    avatar?: string;
    draft?: number;
    listed?: number;
    top?: number;
    title: string;
    summary: string;
    hashtags: { id: number, name: string }[];
    createdAt: Date;
    updatedAt: Date;
    preview?: boolean;
    variant?: FeedCardVariant;
    loginRequired?: number;
    hotScore?: number;
    pv?: number;
    uv?: number;
    commentCount?: number;
    likeCount?: number;
    bookmarkCount?: number;
    user?: { username?: string };
};

export function FeedCard({ id, title, avatar, draft, listed, top, summary, hashtags, createdAt, updatedAt, preview = false, variant, loginRequired, hotScore, pv, uv, commentCount, likeCount, bookmarkCount, user }: FeedCardProps) {
    const { t } = useTranslation();
    const siteConfig = useSiteConfig();
    const profile = useContext(ProfileContext);
    const activeVariant = normalizeFeedCardVariant(variant ?? siteConfig.feedCardVariant);
    const [showLoginTip, setShowLoginTip] = useState(false);
    // 游客面对"仅登录可见"的帖子：隐藏图片与正文/简介
    const locked = loginRequired === 1 && !profile && !preview;
    // 管理员可见：当前热度值
    const hotBadge = profile?.permission && typeof hotScore === "number"
        ? <span className="text-orange-500"><i className="ri-fire-line" /> {Math.round(hotScore)}</span>
        : null;
    const hasStats = [pv, uv, commentCount, likeCount, bookmarkCount].some((value) => typeof value === "number");
    const stats = [
        { icon: "ri-eye-line", label: t("feed_card.stats.views"), value: pv ?? 0 },
        { icon: "ri-user-line", label: t("feed_card.stats.visitors"), value: uv ?? 0 },
        { icon: "ri-chat-1-line", label: t("feed_card.stats.comments"), value: commentCount ?? 0 },
        { icon: "ri-heart-line", label: t("feed_card.stats.likes"), value: likeCount ?? 0 },
        { icon: "ri-bookmark-line", label: t("feed_card.stats.bookmarks"), value: bookmarkCount ?? 0 },
    ];

    const lockedNote = (
        <p className="mt-2 text-sm italic text-neutral-500 dark:text-neutral-400">{t("visible.login_only")}</p>
    );

    const body = activeVariant === "minimal" ? (
        // 极简风：无图片和正文，只显示标题、最后更新日期、发布用户
        <div className="my-2 inline-block w-full break-inside-avoid rounded-2xl bg-w p-5 duration-300 bg-button">
            <h1 className="text-xl font-bold text-gray-700 dark:text-white text-pretty overflow-hidden">{title}</h1>
            {locked && lockedNote}
            <p className="mt-3 text-xs text-gray-400 space-x-2">
                <span title={new Date(updatedAt).toLocaleString()}>{t('feed_card.updated$time', { time: timeago(updatedAt) })}</span>
                {user?.username ? <span>· {user.username}</span> : null}
            </p>
            <p className="space-x-2 text-xs text-gray-400">
                {draft === 1 && <span>{t("draft")}</span>}
                {listed === 0 && <span>{t("unlisted")}</span>}
                {top === 1 && <span className="text-theme">{t('article.top.title')}</span>}
                {hotBadge}
            </p>
        </div>
    ) : (
        // 默认风：不显示正文内容，只显示图片（如有）、标题、时间、简介（如有）、用户名、标签
        <div className="my-2 inline-block w-full break-inside-avoid rounded-2xl bg-w p-6 duration-300 bg-button">
            {!locked && avatar ? <FeedCardImage src={avatar} /> : null}
            <h1 className="text-xl font-bold text-gray-700 dark:text-white text-pretty overflow-hidden">{title}</h1>
            <p className="space-x-2 text-gray-400 text-sm">
                <span title={new Date(createdAt).toLocaleString()}>
                    {createdAt === updatedAt ? timeago(createdAt) : t('feed_card.published$time', { time: timeago(createdAt) })}
                </span>
                {createdAt !== updatedAt && (
                    <span title={new Date(updatedAt).toLocaleString()}>
                        {t('feed_card.updated$time', { time: timeago(updatedAt) })}
                    </span>
                )}
                {user?.username ? <span>· {user.username}</span> : null}
            </p>
            <p className="space-x-2 text-gray-400 text-sm">
                {draft === 1 && <span>{t("draft")}</span>}
                {listed === 0 && <span>{t("unlisted")}</span>}
                {top === 1 && <span className="text-theme">{t('article.top.title')}</span>}
                {hotBadge}
            </p>
            {locked ? lockedNote : (() => {
                const previewText = stripMarkdown(summary);
                return previewText ? <p className="line-clamp-4 text-pretty overflow-hidden dark:text-neutral-500">{previewText}</p> : null;
            })()}
            {hashtags.length > 0 && (
                <div className="flex flex-row flex-wrap justify-start gap-2 mt-2 gap-x-2">
                    {hashtags.map(({ name }, index) => <HashTag key={index} name={name} />)}
                </div>
            )}
            {hasStats && (
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-black/5 pt-3 text-xs text-gray-400 dark:border-white/10 dark:text-neutral-500">
                    {stats.map(({ icon, label, value }) => (
                        <span key={label} className="inline-flex items-center gap-1.5" title={`${label}: ${value}`}>
                            <i className={icon} aria-hidden="true" />
                            <span>{label}</span>
                            <span className="font-medium text-gray-500 dark:text-neutral-400">{formatStatValue(value)}</span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );

    if (preview) return body;

    if (locked) {
        return (
            <>
                <button type="button" onClick={() => setShowLoginTip(true)} className="block w-full text-left">
                    {body}
                </button>
                {showLoginTip && <LoginTipModal onClose={() => setShowLoginTip(false)} />}
            </>
        );
    }

    return <Link href={`/${draft === 1 ? "draft" : "feed"}/${id}`} target="_blank" className="block w-full">{body}</Link>;
}

function LoginTipModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    return createPortal(
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
            onClick={onClose}
        >
            <div
                className="flex flex-col items-center gap-3 rounded-2xl bg-w px-8 py-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <i className="ri-lock-2-line text-4xl text-theme" />
                <p className="t-primary text-base font-medium">{t("visible.login_to_view")}</p>
                <Link href="/login" className="mt-1 rounded-full bg-theme px-5 py-2 text-sm text-white">
                    {t("login.title")}
                </Link>
            </div>
        </div>,
        document.body
    );
}
