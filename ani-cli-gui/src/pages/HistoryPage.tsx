import { useMemo, useState } from "react";
import { Clock3, History, Play, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  clearHistory,
  getContinueWatching,
  //getProgressPercent,
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
  const continueWatching = useMemo(() => getContinueWatching(items), [items]);
  const recentHistory = useMemo(() => getRecentHistory(items, 12), [items]);

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
    <div className="flex-1 min-h-0">
      <section
        className="
          relative
          mx-auto
          max-w-auto
          overflow-hidden
          rounded-3xl
          border
          border-m3-outline/20
          bg-m3-surface-container/70
          p-6
          backdrop-blur-xl
          shadow-2xl
        "
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-400/0 via-m3-primary to-fuchsia-500/0" />

        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div
              className="
                flex
                size-11
                items-center
                justify-center
                rounded-2xl
                bg-m3-primary/10
                text-m3-primary
              "
            >
              <History size={24} />
            </div>

            <div>
              <h1
                className="
                  text-xl
                  font-black
                  uppercase
                  tracking-wider
                "
              >
                {t("history.title")}
              </h1>

              <p
                className="
                  text-xs
                  uppercase
                  tracking-[0.3em]
                  text-m3-on-surface-variant
                "
              >
                {t("history.playbackArchive")}
              </p>
            </div>
          </div>

          <button
            onClick={handleClear}
            disabled={!items.length}
            className="
              flex
              items-center
              gap-2
              rounded-xl
              border
              border-m3-outline/20
              px-3
              py-2
              text-xs
              font-bold
              text-m3-on-surface-variant
              transition
              hover:border-red-400/40
              hover:bg-red-400/10
              hover:text-red-300
              disabled:opacity-30
            "
          >
            <Trash2 size={14} />
            {t("history.clear")}
          </button>
        </header>

        {continueWatching.length > 0 && (
          <section className="mb-8">
            <h2
              className="
                mb-3
                text-xs
                font-black
                uppercase
                tracking-[0.25em]
                text-m3-primary
              "
            >
              {t("history.continueWatching")}
            </h2>

            <div className="grid gap-4 md:grid-cols-2">
              {continueWatching.map((item) => (
                <article
                  key={item.animeId}
                  className="
                    group
                    flex
                    gap-4
                    rounded-2xl
                    border
                    border-m3-outline/15
                    bg-m3-surface/40
                    p-3
                    transition
                    hover:border-m3-primary/40
                  "
                >
                  <div
                    className="
                      h-28
                      w-20
                      shrink-0
                      overflow-hidden
                      rounded-xl
                      bg-m3-surface-container
                    "
                  >
                    {item.coverUrl && (
                      <img
                        src={item.coverUrl}
                        className="
                          h-full
                          w-full
                          object-cover
                        "
                      />
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <h3 className="truncate font-black">{item.animeName}</h3>

                    <span
                      className="
                        mt-1
                        text-xs
                        uppercase
                        text-m3-on-surface-variant
                      "
                    >
                      {t("history.episode", { episode: item.latest.episode })}
                    </span>

                    <div
                      className="
                        mt-auto
                        mb-2
                        h-1.5
                        overflow-hidden
                        rounded-full
                        bg-m3-outline/20
                      "
                    >
                      <div
                        className="
                          h-full
                          bg-m3-primary
                        "
                        style={{
                          width: `${item.progressPercent}%`,
                        }}
                      />
                    </div>

                    <button
                      onClick={() => onResume(item.latest)}
                      className="
                        flex
                        items-center
                        justify-center
                        gap-2
                        rounded-xl
                        bg-m3-primary
                        px-3
                        py-2
                        text-xs
                        font-black
                        text-m3-on-primary
                      "
                    >
                      <Play size={13} />
                      {t("history.resume")}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Recent */}

        <section>
          <h2
            className="
              mb-3
              text-xs
              font-black
              uppercase
              tracking-[0.25em]
              text-m3-on-surface-variant
            "
          >
            {t("history.recentActivity")}
          </h2>

          <div className="space-y-2">
            {recentHistory.map((item, index) => (
              <button
                key={`${item.animeId}-${item.episode}-${index}`}
                onClick={() => onResume(item)}
                className="
                  flex
                  w-full
                  items-center
                  justify-between
                  rounded-xl
                  border
                  border-m3-outline/10
                  bg-m3-surface/30
                  px-4
                  py-3
                  text-left
                  transition
                  hover:border-m3-primary/30
                "
              >
                <div>
                  <p className="font-bold">{item.animeName}</p>

                  <span
                    className="
                      flex
                      items-center
                      gap-2
                      text-xs
                      text-m3-on-surface-variant
                    "
                  >
                    <Clock3 size={12} />
                    {t("history.episode", { episode: item.episode })}
                  </span>
                </div>

                <span
                  className="
                    text-xs
                    font-bold
                    text-m3-primary
                  "
                >
                  {formatProgress(item.progressSeconds)}
                </span>
              </button>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
