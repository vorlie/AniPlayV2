import { useMemo, useState } from "react";
import {
  Clock3,
  History,
  Play,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  clearHistory,
  getContinueWatching,
  getRecentHistory,
  readHistory,
  type HistoryEntry,
} from "../lib/history";

export function HistoryPage({
  onResume,
}: {
  onResume: (item: HistoryEntry) => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<HistoryEntry[]>(() => readHistory());

  const refresh = () => setItems(readHistory());

  const continueWatching = useMemo(
    () => getContinueWatching(items),
    [items],
  );

  const recentHistory = useMemo(
    () => getRecentHistory(items, 12),
    [items],
  );

  const formatProgress = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return t("history.resumeStart");
    }

    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const secs = total % 60;

    return `${minutes}:${String(secs).padStart(2, "0")}`;
  };

  const handleClear = () => {
    if (!window.confirm(t("history.confirmClear"))) {
      return;
    }

    clearHistory();
    refresh();
  };

  return (
    <div className="history-page">
      <header className="history-header">
        <div>
          <div className="history-eyebrow">
            {t("history.playbackArchive")}
          </div>

          <h1 className="history-title">
            {t("history.title")}
          </h1>

          <p className="history-subtitle">
            {items.length > 0
              ? `${items.length} ${items.length === 1 ? "entry" : "entries"}`
              : t("history.empty")}
          </p>
        </div>

        <button
          type="button"
          className="icon-button history-clear"
          onClick={handleClear}
          disabled={!items.length}
          title={t("history.clear")}
          aria-label={t("history.clear")}
        >
          <Trash2 size={17} />
        </button>
      </header>

      {continueWatching.length > 0 && (
        <section className="history-section">
          <div className="history-section-header">
            <h2>{t("history.continueWatching")}</h2>
            <span>{continueWatching.length}</span>
          </div>

          <div className="continue-list">
            {continueWatching.map((item) => (
              <article
                key={item.animeId}
                className="continue-row"
              >
                <div className="continue-cover">
                  {item.coverUrl ? (
                    <img
                      src={item.coverUrl}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <div className="continue-cover-placeholder">
                      <History size={18} />
                    </div>
                  )}
                </div>

                <div className="continue-main">
                  <div className="continue-heading">
                    <div className="continue-title-group">
                      <h3 className="continue-title">
                        {item.animeName}
                      </h3>

                      <span className="continue-episode">
                        {t("history.episode", {
                          episode: item.latest.episode,
                        })}
                      </span>
                    </div>

                    <span className="continue-percent">
                      {Math.round(item.progressPercent)}%
                    </span>
                  </div>

                  <div className="continue-meta">
                    <span>
                      {formatProgress(item.latest.progressSeconds)}
                    </span>
                  </div>

                  <div className="history-progress">
                    <div className="history-progress-track">
                      <div
                        className="history-progress-fill"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(100, item.progressPercent),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="history-resume"
                  onClick={() => onResume(item.latest)}
                >
                  <Play size={14} />
                  {t("history.resume")}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="history-section">
        <div className="history-section-header">
          <h2>{t("history.recentActivity")}</h2>
          <span>{recentHistory.length}</span>
        </div>

        {recentHistory.length > 0 ? (
          <div className="history-list">
            {recentHistory.map((item, index) => (
              <button
                key={`${item.animeId}-${item.episode}-${index}`}
                type="button"
                className="history-row"
                onClick={() => onResume(item)}
              >
                <div className="history-row-icon">
                  <Clock3 size={16} />
                </div>

                <div className="history-row-main">
                  <span className="history-row-title">
                    {item.animeName}
                  </span>

                  <span className="history-row-episode">
                    {t("history.episode", {
                      episode: item.episode,
                    })}
                  </span>
                </div>

                <span className="history-row-progress">
                  {formatProgress(item.progressSeconds)}
                </span>

                <Play
                  size={14}
                  className="history-row-play"
                />
              </button>
            ))}
          </div>
        ) : (
          <div className="history-empty">
            <div className="history-empty-icon">
              <History size={22} />
            </div>

            <h3>{t("history.empty")}</h3>

            <p>
              Your watched episodes will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}