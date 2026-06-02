import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Popup from "reactjs-popup";
import { EMOJI_GROUPS } from "../utils/emoji";
import { HEADER_POPUP_PANEL_CLASS } from "./site-header/shared";

export const CommentEmojiPicker = memo(function CommentEmojiPicker({
  onSelect,
}: {
  onSelect: (emoji: string) => void;
}) {
  const { t } = useTranslation();
  const [activeGroupKey, setActiveGroupKey] = useState(EMOJI_GROUPS[0]?.key ?? "");
  const activeGroup = useMemo(
    () => EMOJI_GROUPS.find((group) => group.key === activeGroupKey) ?? EMOJI_GROUPS[0],
    [activeGroupKey],
  );

  return (
    <Popup
      arrow={false}
      position="top left"
      closeOnDocumentClick
      trigger={
        <button
          type="button"
          title={t("comment.emoji")}
          className="bg-secondary bg-button t-secondary px-3 h-10 rounded-full leading-none inline-flex items-center justify-center"
        >
          😀
        </button>
      }
    >
      {((close: () => void) => (
        <div className={`${HEADER_POPUP_PANEL_CLASS} w-72`}>
          <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-black/5 pb-2 dark:border-white/10">
            {EMOJI_GROUPS.map((group) => {
              const active = group.key === activeGroup?.key;
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => setActiveGroupKey(group.key)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? "bg-theme text-white"
                      : "t-secondary hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                >
                  {t(`emoji.group.${group.key}`)}
                </button>
              );
            })}
          </div>
          <div className="mt-2 grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
            {activeGroup?.emojis.map((emoji, index) => (
              <button
                key={`${activeGroup.key}-${index}`}
                type="button"
                onClick={() => {
                  onSelect(emoji);
                  close();
                }}
                className="rounded text-xl leading-none hover:bg-black/5 dark:hover:bg-white/10 py-1"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )) as any}
    </Popup>
  );
});
