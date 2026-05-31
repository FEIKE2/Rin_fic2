import { useState } from "react";
import { useTranslation } from "react-i18next";
import ReactModal from "react-modal";
import type { FeedEditHistory } from "@rin/api";
import { timeago } from "../utils/timeago";
import { Markdown } from "./markdown";

interface EditHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  feedId: number;
  history: FeedEditHistory[];
  loading: boolean;
}

export function EditHistoryModal({
  isOpen,
  onClose,
  history,
  loading,
}: EditHistoryModalProps) {
  const { t } = useTranslation();
  const [selectedHistory, setSelectedHistory] = useState<FeedEditHistory | null>(null);

  const handleClose = () => {
    setSelectedHistory(null);
    onClose();
  };

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={handleClose}
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
          maxWidth: "90vw",
          maxHeight: "90vh",
          width: selectedHistory ? "800px" : "600px",
          overflow: "hidden",
        },
        overlay: {
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          zIndex: 1000,
        },
      }}
      contentLabel={t("edit_history.title")}
    >
      <div className="flex flex-col h-full max-h-[90vh] bg-w">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10">
          <h2 className="text-xl font-bold t-primary">
            {selectedHistory ? t("edit_history.view_detail") : t("edit_history.title")}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            aria-label={t("close")}
          >
            <i className="ri-close-line text-xl t-primary" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-gray-400">{t("edit_history.loading")}</p>
            </div>
          ) : selectedHistory ? (
            // Detail View
            <div className="space-y-4">
              <button
                onClick={() => setSelectedHistory(null)}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-theme transition-colors"
              >
                <i className="ri-arrow-left-line" />
                <span>{t("index.back")}</span>
              </button>

              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-400 mb-1">
                    {t("edit_history.edited_by", { username: selectedHistory.user.username })}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(selectedHistory.createdAt).toLocaleString()}
                  </p>
                </div>

                {selectedHistory.editReason && (
                  <div className="p-4 rounded-xl bg-black/5 dark:bg-white/5">
                    <p className="text-xs font-semibold text-gray-500 mb-1">
                      {t("edit_history.reason")}
                    </p>
                    <p className="text-sm t-primary">{selectedHistory.editReason}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-lg font-bold t-primary">{selectedHistory.title}</h3>
                  {selectedHistory.summary && (
                    <p className="text-sm text-gray-500">{selectedHistory.summary}</p>
                  )}
                </div>

                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <Markdown content={selectedHistory.content} />
                </div>
              </div>
            </div>
          ) : history.length === 0 ? (
            // Empty State
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <i className="ri-history-line text-4xl text-gray-300 mb-4" />
              <p className="text-gray-400">{t("edit_history.no_history")}</p>
            </div>
          ) : (
            // List View
            <div className="space-y-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-black/10 dark:border-white/10 hover:border-theme/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedHistory(item)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <img
                          src={item.user.avatar || "/avatar.png"}
                          alt={item.user.username}
                          className="w-5 h-5 rounded-full"
                        />
                        <p className="text-sm font-medium t-primary">
                          {item.user.username}
                        </p>
                      </div>
                      <p className="text-xs text-gray-400 mb-2">
                        {timeago(item.createdAt)}
                      </p>
                      {item.editReason && (
                        <p className="text-sm text-gray-500 truncate">
                          {t("edit_history.reason")}: {item.editReason}
                        </p>
                      )}
                    </div>
                    <button
                      className="shrink-0 px-3 py-1.5 text-xs font-medium text-theme hover:bg-theme/10 rounded-lg transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedHistory(item);
                      }}
                    >
                      {t("edit_history.view_detail")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ReactModal>
  );
}
