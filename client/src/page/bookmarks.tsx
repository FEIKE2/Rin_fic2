import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useContext } from "react";
import { client } from "../app/runtime";
import { FeedCard } from "../components/feed_card";
import { ProfileContext } from "../state/profile";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { normalizeFeedLayout } from "../components/feed-layout-options";
import { normalizeFeedCardVariant } from "../components/feed-card-options";

const LS_LAYOUT = "user.feed.layout";
const LS_CARD = "user.feed.card_variant";

export function BookmarksPage() {
    const { t } = useTranslation();
    const siteConfig = useSiteConfig();
    const profile = useContext(ProfileContext);
    const [, setLocation] = useLocation();
    const [feeds, setFeeds] = useState<any[]>([]);

    // 沿用用户在「帖文」栏目中设置的布局与卡片样式偏好
    const feedLayout = normalizeFeedLayout(localStorage.getItem(LS_LAYOUT) ?? siteConfig.feedLayout);
    const cardVariant = normalizeFeedCardVariant(localStorage.getItem(LS_CARD) ?? siteConfig.feedCardVariant);
    const feedListClass = feedLayout === "masonry" ? "wauto columns-1 gap-5 md:columns-2" : "wauto flex flex-col";

    useEffect(() => {
        if (profile === null) { setLocation("/login"); return; }
        if (!profile) return;
        client.interaction.bookmarks().then(({ data }) => {
            if (data) setFeeds(data);
        });
    }, [profile]);

    return (
        <main className="w-full flex flex-col justify-center items-center mb-8">
            <div className="wauto text-start text-black dark:text-white py-4 text-4xl font-bold">
                <p>{t("bookmarks")}</p>
            </div>
            <div className={feedListClass}>
                {feeds.map(({ id, ...feed }: any) => (
                    <FeedCard key={id} id={id} {...feed} user={feed.user} variant={cardVariant} />
                ))}
            </div>
        </main>
    );
}
