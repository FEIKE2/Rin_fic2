import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useContext } from "react";
import { client } from "../app/runtime";
import { FeedCard } from "../components/feed_card";
import { ProfileContext } from "../state/profile";
import { useSiteConfig } from "../hooks/useSiteConfig";

export function BookmarksPage() {
    const { t } = useTranslation();
    const siteConfig = useSiteConfig();
    const profile = useContext(ProfileContext);
    const [, setLocation] = useLocation();
    const [feeds, setFeeds] = useState<any[]>([]);

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
            <div className={siteConfig.feedLayout === "masonry" ? "wauto columns-1 gap-5 md:columns-2" : "wauto flex flex-col"}>
                {feeds.map(({ id, ...feed }: any) => (
                    <FeedCard key={id} id={id} {...feed} user={feed.user} />
                ))}
            </div>
        </main>
    );
}
