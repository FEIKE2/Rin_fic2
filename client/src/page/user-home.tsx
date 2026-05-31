import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { client } from "../app/runtime";
import { Waiting } from "../components/loading";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { FeedCard } from "../components/feed_card";
import { UserAvatarLink } from "../components/user-hover-card";

type PublicUser = {
    id: number;
    username: string;
    avatar: string | null;
    bio: string;
    feedCount: number;
    totalPv: number;
    totalUv: number;
};

export function UserHomePage({ userId }: { userId: number }) {
    const { t } = useTranslation();
    const siteConfig = useSiteConfig();
    const [user, setUser] = useState<PublicUser | null>(null);
    const [feeds, setFeeds] = useState<any[]>([]);
    const [error, setError] = useState<string>();

    useEffect(() => {
        client.publicUser.get(userId).then(({ data, error }) => {
            if (error) setError(error.value as string);
            else if (data) setUser(data);
        });
        client.feed.list({ type: "normal", limit: 50 }).then(({ data }) => {
            if (data) {
                setFeeds(data.data.filter((f: any) => f.user?.id === userId));
            }
        });
    }, [userId]);

    if (error) return <div className="wauto m-4 rounded-2xl bg-w p-6 t-primary">{error}</div>;

    return (
        <Waiting for={user}>
            {user && (
                <div className="wauto flex flex-col gap-4 py-4">
                    <div className="rounded-2xl bg-w p-6">
                        <div className="flex items-center gap-4">
                            <UserAvatarLink user={user} className="h-16 w-16 rounded-full" />
                            <div>
                                <h1 className="text-xl font-bold t-primary">{user.username}</h1>
                                {user.bio && <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{user.bio}</p>}
                            </div>
                        </div>
                        <div className="mt-4 flex gap-6 text-sm text-neutral-500 dark:text-neutral-400">
                            <span>{t("article.total_short$count", { count: user.feedCount })}</span>
                            <span>{t("count.pv")} {user.totalPv}</span>
                            <span>{t("count.uv")} {user.totalUv}</span>
                        </div>
                    </div>
                    <div className={siteConfig.feedLayout === "masonry" ? "columns-1 gap-5 md:columns-2" : "flex flex-col"}>
                        {feeds.map(({ id, ...feed }: any) => (
                            <FeedCard key={id} id={id} {...feed} user={feed.user} />
                        ))}
                    </div>
                </div>
            )}
        </Waiting>
    );
}
