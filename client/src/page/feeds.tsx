import { useContext, useEffect, useRef, useState } from "react"
import { Helmet } from 'react-helmet'
import { Link, useSearch } from "wouter"
import { FeedCard } from "../components/feed_card"
import { Waiting } from "../components/loading"
import { client } from "../app/runtime"
import { ProfileContext } from "../state/profile"
import { useSiteConfig } from "../hooks/useSiteConfig";
import { siteName } from "../utils/constants"
import { tryInt } from "../utils/int"
import { useTranslation } from "react-i18next";
import Popup from "reactjs-popup";
import { HEADER_POPUP_PANEL_CLASS } from "../components/site-header/shared";
import { FEED_LAYOUT_OPTIONS, normalizeFeedLayout, type FeedLayout } from "../components/feed-layout-options";
import { FEED_CARD_VARIANTS, normalizeFeedCardVariant, type FeedCardVariant } from "../components/feed-card-options";

const LS_LAYOUT = "user.feed.layout";
const LS_CARD = "user.feed.card_variant";
const LS_SORT = "user.feed.sort";

type SortOrder = "latest" | "popular";
type FeedsData = { size: number, data: any[], hasNext: boolean }
type FeedType = 'draft' | 'unlisted' | 'normal'
type FeedsMap = { [key in FeedType]: FeedsData }

function useLocalPref<T extends string>(key: string, fallback: T, normalize: (v: string) => T): [T, (v: T) => void] {
    const [val, setVal] = useState<T>(() => normalize(localStorage.getItem(key) ?? fallback));
    function set(v: T) {
        localStorage.setItem(key, v);
        setVal(v);
    }
    return [val, set];
}

export function FeedsPage() {
    const { t } = useTranslation()
    const siteConfig = useSiteConfig();
    const query = new URLSearchParams(useSearch());
    const profile = useContext(ProfileContext);
    const [listState, _setListState] = useState<FeedType>(query.get("type") as FeedType || 'normal')
    const [status, setStatus] = useState<'loading' | 'idle'>('idle')
    const [feeds, setFeeds] = useState<FeedsMap>({
        draft: { size: 0, data: [], hasNext: false },
        unlisted: { size: 0, data: [], hasNext: false },
        normal: { size: 0, data: [], hasNext: false }
    })
    const page = tryInt(1, query.get("page"))
    const limit = tryInt(siteConfig.pageSize, query.get("limit"))

    const [feedLayout, setFeedLayout] = useLocalPref<FeedLayout>(LS_LAYOUT, siteConfig.feedLayout, normalizeFeedLayout);
    const [cardVariant, setCardVariant] = useLocalPref<FeedCardVariant>(LS_CARD, siteConfig.feedCardVariant, normalizeFeedCardVariant);
    const [sortOrder, setSortOrder] = useLocalPref<SortOrder>(LS_SORT, "latest", (v) => v === "popular" ? "popular" : "latest");

    const feedListClass = feedLayout === "masonry" ? "wauto columns-1 gap-5 ani-show md:columns-2" : "wauto flex flex-col ani-show";
    const ref = useRef("")

    function fetchFeeds(type: FeedType) {
        client.feed.list({
            page: page,
            limit: limit,
            type: type,
            sort: sortOrder,
        }).then(({ data }) => {
            if (data) {
                setFeeds(prev => ({ ...prev, [type]: data }))
                setStatus('idle')
            }
        })
    }
    useEffect(() => {
        const key = `${query.get("page")} ${query.get("type")} ${limit} ${sortOrder}`
        if (ref.current == key) return
        const type = query.get("type") as FeedType || 'normal'
        if (type !== listState) _setListState(type)
        setStatus('loading')
        fetchFeeds(type)
        ref.current = key
    }, [limit, query.get("page"), query.get("type"), sortOrder])

    const sortedData = feeds[listState].data;

    return (
        <>
            <Helmet>
                <title>{`${t('article.title')} - ${siteConfig.name}`}</title>
                <meta property="og:site_name" content={siteName} />
                <meta property="og:title" content={t('article.title')} />
                <meta property="og:image" content={siteConfig.avatar} />
                <meta property="og:type" content="article" />
                <meta property="og:url" content={document.URL} />
            </Helmet>
            <Waiting for={feeds.draft.size + feeds.normal.size + feeds.unlisted.size > 0 || status === 'idle'}>
                <main className="w-full flex flex-col justify-center items-center mb-8">
                    <div className="wauto text-start text-black dark:text-white py-4 text-4xl font-bold">
                        <p>
                            {listState === 'draft' ? t('draft_bin') : listState === 'normal' ? t('article.title') : t('unlisted')}
                        </p>
                        <div className="flex flex-row justify-between items-center">
                            <p className="text-sm mt-4 text-neutral-500 font-normal">
                                {t('article.total$count', { count: feeds[listState]?.size })}
                            </p>
                            <div className="flex flex-row items-center gap-2 mt-4">
                                {/* 布局和卡片样式设置 */}
                                <FeedDisplayPopup
                                    feedLayout={feedLayout}
                                    setFeedLayout={setFeedLayout}
                                    cardVariant={cardVariant}
                                    setCardVariant={setCardVariant}
                                />
                                {/* 排序方式 */}
                                <SortPopup sortOrder={sortOrder} setSortOrder={setSortOrder} />
                                {profile &&
                                    <Link href={listState === 'draft' ? '/?type=normal' : '/?type=draft'} className={`text-sm text-neutral-500 font-normal ${listState === 'draft' ? "text-theme" : ""}`}>
                                        {t('draft_bin')}
                                    </Link>
                                }
                                {profile?.permission &&
                                    <Link href={listState === 'unlisted' ? '/?type=normal' : '/?type=unlisted'} className={`text-sm text-neutral-500 font-normal ${listState === 'unlisted' ? "text-theme" : ""}`}>
                                        {t('unlisted')}
                                    </Link>
                                }
                            </div>
                        </div>
                    </div>
                    <Waiting for={status === 'idle'}>
                        <div className={feedListClass}>
                            {sortedData.map(({ id, ...feed }: any) => (
                                <FeedCard key={id} id={id} {...feed} user={feed.user} variant={cardVariant} />
                            ))}
                        </div>
                        <div className="wauto flex flex-row items-center mt-4 ani-show">
                            {page > 1 &&
                                <Link href={`/?type=${listState}&page=${(page - 1)}`}
                                    className={`text-sm font-normal rounded-full px-4 py-2 text-white bg-theme`}>
                                    {t('previous')}
                                </Link>
                            }
                            <div className="flex-1" />
                            {feeds[listState]?.hasNext &&
                                <Link href={`/?type=${listState}&page=${(page + 1)}`}
                                    className={`text-sm font-normal rounded-full px-4 py-2 text-white bg-theme`}>
                                    {t('next')}
                                </Link>
                            }
                        </div>
                    </Waiting>
                </main>
            </Waiting>
        </>
    )
}

function SortPopup({ sortOrder, setSortOrder }: { sortOrder: SortOrder; setSortOrder: (v: SortOrder) => void }) {
    const { t } = useTranslation();
    return (
        <Popup
            trigger={
                <button className="flex items-center gap-1 rounded-lg border border-black/10 px-3 py-1.5 text-sm t-primary bg-w hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                    <i className="ri-sort-desc" />
                    <span>{sortOrder === "popular" ? t("sort_popular") : t("sort_latest")}</span>
                    <i className="ri-arrow-down-s-line text-xs" />
                </button>
            }
            arrow={false}
            position="bottom right"
            closeOnDocumentClick
        >
            <div className={`${HEADER_POPUP_PANEL_CLASS} min-w-28`}>
                {(["latest", "popular"] as SortOrder[]).map(opt => (
                    <button
                        key={opt}
                        onClick={() => setSortOrder(opt)}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm t-primary transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${sortOrder === opt ? "text-theme font-medium" : ""}`}
                    >
                        {opt === "latest" ? t("sort_latest") : t("sort_popular")}
                        {sortOrder === opt && <i className="ri-check-line ml-auto text-theme" />}
                    </button>
                ))}
            </div>
        </Popup>
    );
}

function FeedDisplayPopup({
    feedLayout, setFeedLayout,
    cardVariant, setCardVariant,
}: {
    feedLayout: FeedLayout; setFeedLayout: (v: FeedLayout) => void;
    cardVariant: FeedCardVariant; setCardVariant: (v: FeedCardVariant) => void;
}) {
    const { t } = useTranslation();
    return (
        <Popup
            trigger={
                <button className="flex items-center gap-1 rounded-lg border border-black/10 px-3 py-1.5 text-sm t-primary bg-w hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                    <i className="ri-layout-line" />
                    <i className="ri-arrow-down-s-line text-xs" />
                </button>
            }
            arrow={false}
            position="bottom right"
            closeOnDocumentClick
        >
            <div className={`${HEADER_POPUP_PANEL_CLASS} min-w-44`}>
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                    {t("settings.feed_layout.title")}
                </p>
                {FEED_LAYOUT_OPTIONS.map(opt => (
                    <button
                        key={opt}
                        onClick={() => setFeedLayout(opt)}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm t-primary transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${feedLayout === opt ? "text-theme font-medium" : ""}`}
                    >
                        {t(`settings.feed_layout.options.${opt}`)}
                        {feedLayout === opt && <i className="ri-check-line ml-auto text-theme" />}
                    </button>
                ))}
                <div className="my-1 border-t border-black/5 dark:border-white/10" />
                <p className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                    {t("settings.feed_card.title")}
                </p>
                {FEED_CARD_VARIANTS.map(opt => (
                    <button
                        key={opt}
                        onClick={() => setCardVariant(opt)}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm t-primary transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${cardVariant === opt ? "text-theme font-medium" : ""}`}
                    >
                        {t(`settings.feed_card.options.${opt}`)}
                        {cardVariant === opt && <i className="ri-check-line ml-auto text-theme" />}
                    </button>
                ))}
            </div>
        </Popup>
    );
}
