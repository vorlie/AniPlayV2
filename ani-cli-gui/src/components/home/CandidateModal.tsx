import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Search } from "lucide-react";
import type { CatalogCandidate, AnimeSummary } from "../../anilist-types";
import type { CatalogProvider } from "../../lib/api";

interface CandidateDialog {
  media: AnimeSummary;
  query: string;
  items: CatalogCandidate[];
  loading: boolean;
  error: string | null;
}

function providerLabel(provider: CatalogProvider) {
  if (provider === "desu") return "Desu";
  if (provider === "docchi") return "Docchi";
  if (provider === "anidb") return "AniDB.app";
  if (provider === "anikoto2") return "Anikoto 2";
  return "Anikoto 1";
}

interface CandidateModalProps {
  dialog: CandidateDialog;
  setDialog: (dialog: CandidateDialog | null) => void;
  onRetry: (query: string) => void;
  onChoose: (item: CatalogCandidate) => void;
}

export function CandidateModal({
  dialog,
  setDialog,
  onRetry,
  onChoose,
}: CandidateModalProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(dialog.query);
  return (
    <div className="home-modal-overlay">
      <div className="home-modal">
        <h3 className="home-modal-title">{t("home.chooseMatch")}</h3>
        <p className="home-modal-subtitle">
          {t("home.aniListTitle", { title: dialog.media.title })}
        </p>
        <div className="home-modal-search">
          <Search
            aria-hidden="true"
            className="home-modal-search-icon"
            size={18}
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && query.trim()) onRetry(query.trim());
            }}
          />
          <button
            disabled={!query.trim() || dialog.loading}
            onClick={() => onRetry(query.trim())}
          >
            {dialog.loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Search size={16} />
            )}{" "}
            {t("home.retry")}
          </button>
        </div>
        {dialog.error ? (
          <p
            role="alert"
            className="home-alert home-alert--error"
          >
            {dialog.error}
          </p>
        ) : null}
        <div className="home-modal-results">
          {dialog.loading ? (
            <div className="home-modal-loading">
              <Loader2 className="animate-spin" />
            </div>
          ) : dialog.items.length ? (
            dialog.items.map((item) => (
              <button
                key={`${item.anime.catalogProvider}:${item.anime.id}`}
                onClick={() => onChoose(item)}
                className="home-modal-item"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="home-modal-item-title">{item.anime.name}</p>
                  <span className="home-modal-item-score">
                    {Math.round(item.confidence * 100)}%
                  </span>
                </div>
                <p className="home-modal-item-meta">
                  {providerLabel(item.anime.catalogProvider)} ·{" "}
                  {item.anime.episodes
                    ? t("home.episodeCount", { count: item.anime.episodes })
                    : "?"}{" "}
                  · {item.reasons.join(", ") || "title candidate"}
                </p>
              </button>
            ))
          ) : (
            <div className="home-modal-empty">
              {t("home.noMatches")}
            </div>
          )}
        </div>
        <button
          onClick={() => setDialog(null)}
          className="home-modal-cancel"
        >
          {t("home.cancel")}
        </button>
      </div>
    </div>
  );
}

export type { CandidateDialog };
