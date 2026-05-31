import { useState } from "react";
import { useTranslation } from "react-i18next";
import Popup from "reactjs-popup";
import { Link } from "wouter";
import { client } from "../app/runtime";
import { HEADER_POPUP_PANEL_CLASS } from "./site-header/shared";

type PublicUser = {
  id: number;
  username: string;
  avatar: string | null;
  bio: string;
  feedCount: number;
  totalPv: number;
  totalUv: number;
};

export function UserAvatarLink({
  user,
  className = "h-8 w-8 rounded-full",
}: {
  user?: {
    id?: number;
    username?: string;
    avatar?: string | null;
  } | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const [details, setDetails] = useState<PublicUser | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<number | null>(null);
  const userId = user?.id;
  const username = user?.username || t("anonymous");
  const avatar = user?.avatar || "/avatar.png";

  function loadDetails() {
    if (!userId || loadedUserId === userId) return;
    setLoadedUserId(userId);
    client.publicUser.get(userId).then(({ data }) => {
      if (data) setDetails(data);
    });
  }

  if (!userId) {
    return <img src={avatar} alt={username} className={`${className} object-cover`} />;
  }

  return (
    <Popup
      arrow={false}
      on="hover"
      position="top center"
      closeOnDocumentClick
      onOpen={loadDetails}
      trigger={
        <Link href={`/user/${userId}`} className="inline-flex shrink-0">
          <img src={avatar} alt={username} className={`${className} object-cover transition hover:brightness-95`} />
        </Link>
      }
    >
      <div className={`w-72 ${HEADER_POPUP_PANEL_CLASS}`}>
        <div className="flex items-start gap-3">
          <img src={details?.avatar || avatar} alt={details?.username || username} className="h-12 w-12 rounded-full object-cover" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold t-primary">{details?.username || username}</p>
            <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
              {details?.bio || t("profile.no_bio")}
            </p>
          </div>
        </div>
        {details ? (
          <div className="mt-3 flex gap-4 text-xs text-neutral-500 dark:text-neutral-400">
            <span>{t("article.total_short$count", { count: details.feedCount })}</span>
            <span>{t("count.pv")} {details.totalPv}</span>
            <span>{t("count.uv")} {details.totalUv}</span>
          </div>
        ) : null}
      </div>
    </Popup>
  );
}
