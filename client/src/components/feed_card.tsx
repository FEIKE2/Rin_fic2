import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { timeago } from "../utils/timeago";
import { HashTag } from "./hashtag";
import { useEffect, useRef } from "react";
import { drawBlurhashToCanvas } from "../utils/blurhash";
import { parseImageUrlMetadata } from "../utils/image-upload";
import { useImageLoadState } from "../utils/use-image-load-state";
import { type FeedCardVariant, normalizeFeedCardVariant } from "./feed-card-options";
import { useSiteConfig } from "../hooks/useSiteConfig";

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
    user?: { username?: string };
};

export function FeedCard({ id, title, avatar, draft, listed, top, summary, hashtags, createdAt, updatedAt, preview = false, variant, user }: FeedCardProps) {
    const { t } = useTranslation();
    const siteConfig = useSiteConfig();
    const activeVariant = normalizeFeedCardVariant(variant ?? siteConfig.feedCardVariant);

    const body = activeVariant === "minimal" ? (
        // 极简风：无图片和正文，只显示标题、最后更新日期、发布用户
        <div className="my-2 inline-block w-full break-inside-avoid rounded-2xl bg-w p-5 duration-300 bg-button">
            <h1 className="text-xl font-bold text-gray-700 dark:text-white text-pretty overflow-hidden">{title}</h1>
            <p className="mt-3 text-xs text-gray-400 space-x-2">
                <span title={new Date(updatedAt).toLocaleString()}>{t('feed_card.updated$time', { time: timeago(updatedAt) })}</span>
                {user?.username ? <span>· {user.username}</span> : null}
            </p>
            <p className="space-x-2 text-xs text-gray-400">
                {draft === 1 && <span>{t("draft")}</span>}
                {listed === 0 && <span>{t("unlisted")}</span>}
                {top === 1 && <span className="text-theme">{t('article.top.title')}</span>}
            </p>
        </div>
    ) : (
        // 默认风：不显示正文内容，只显示图片（如有）、标题、时间、简介（如有）、用户名、标签
        <div className="my-2 inline-block w-full break-inside-avoid rounded-2xl bg-w p-6 duration-300 bg-button">
            {avatar ? <FeedCardImage src={avatar} /> : null}
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
            </p>
            {summary ? <p className="line-clamp-4 text-pretty overflow-hidden dark:text-neutral-500">{summary}</p> : null}
            {hashtags.length > 0 && (
                <div className="flex flex-row flex-wrap justify-start gap-2 mt-2 gap-x-2">
                    {hashtags.map(({ name }, index) => <HashTag key={index} name={name} />)}
                </div>
            )}
        </div>
    );

    return preview ? body : <Link href={`/feed/${id}`} target="_blank" className="block w-full">{body}</Link>;
}
