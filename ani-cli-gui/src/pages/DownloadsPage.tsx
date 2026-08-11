import {
  AlertCircle,
  CheckCircle2,
  Download,
  FolderOpen,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DownloadJob, DownloadState } from "../download-types";

const ACTIVE = new Set(["queued", "resolving", "downloading"]);
const RETRYABLE = new Set(["failed", "cancelled", "interrupted"]);

function statusLabel(
  job: DownloadJob,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (job.status === "queued") {
    return t("downloads.statuses.queued");
  }

  if (job.status === "resolving") {
    return t("downloads.statuses.resolving");
  }

  if (job.status === "downloading") {
    return job.progress.percent == null
      ? t("downloads.statuses.downloading")
      : `${Math.round(job.progress.percent)}%`;
  }

  return t(`downloads.statuses.${job.status}`, {
    defaultValue: job.status.charAt(0).toUpperCase() + job.status.slice(1),
  });
}

function statusIcon(job: DownloadJob) {
  if (job.status === "completed") {
    return <CheckCircle2 size={18} />;
  }

  if (ACTIVE.has(job.status)) {
    return (
      <Loader2
        size={18}
        className={job.status !== "queued" ? "download-status-spin" : undefined}
      />
    );
  }

  return <AlertCircle size={18} />;
}

function statusClass(job: DownloadJob): string {
  if (job.status === "completed") {
    return "download-status download-status--completed";
  }

  if (ACTIVE.has(job.status)) {
    return "download-status download-status--active";
  }

  return "download-status download-status--error";
}

export function DownloadsPage({ state }: { state: DownloadState | null }) {
  const { t } = useTranslation();

  const jobs = state?.jobs ?? [];

  const activeJobs = jobs.filter((job) => ACTIVE.has(job.status));
  const completedJobs = jobs.filter((job) => job.status === "completed");
  const otherJobs = jobs.filter(
    (job) => !ACTIVE.has(job.status) && job.status !== "completed",
  );

  const activeCount = activeJobs.length;

  const queuedPosition = new Map<string, number>(
    jobs
      .filter((job) => job.status === "queued")
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((job, index): [string, number] => [job.id, index + 1]),
  );

  const invoke = (action: Promise<unknown>) => {
    void action;
  };

  const renderJob = (job: DownloadJob) => {
    const active = ACTIVE.has(job.status);
    const canRetry = RETRYABLE.has(job.status);
    const percent =
      job.progress.percent == null
        ? null
        : Math.max(0, Math.min(100, job.progress.percent));

    return (
      <article
        key={job.id}
        className={`download-row ${active ? "download-row--active" : ""}`}
      >
        <div className={statusClass(job)}>{statusIcon(job)}</div>

        <div className="download-main">
          <div className="download-heading">
            <div className="download-title-group">
              <h3 className="download-title">
                {job.request.animeName}
              </h3>

              <span className="download-episode">
                {t("downloads.episode", {
                  episode: job.request.episode,
                })}
              </span>
            </div>

            <span
              className={`download-state ${job.status === "completed"
                  ? "download-state--completed"
                  : RETRYABLE.has(job.status)
                    ? "download-state--error"
                    : ""
                }`}
            >
              {statusLabel(job, t)}
            </span>
          </div>

          <div className="download-meta">
            <span>{job.request.provider}</span>
            <span>{job.request.resolution}</span>
            <span>{job.request.translationType.toUpperCase()}</span>

            {job.status === "queued" && (
              <span>
                {t("downloads.queue", {
                  position: queuedPosition.get(job.id),
                })}
              </span>
            )}
          </div>

          {job.status === "downloading" && (
            <div className="download-progress">
              <div className="download-progress-track">
                <div
                  className="download-progress-fill"
                  style={{
                    width: percent == null ? "35%" : `${percent}%`,
                  }}
                />
              </div>

              <span className="download-progress-value">
                {percent == null ? "…" : `${Math.round(percent)}%`}
              </span>
            </div>
          )}

          {job.status === "resolving" && (
            <div className="download-progress">
              <div className="download-progress-track download-progress-track--indeterminate">
                <div className="download-progress-fill" />
              </div>
            </div>
          )}

          {job.error && (
            <p className="download-error">
              {job.error}
            </p>
          )}

          {job.fileName && job.status === "completed" && (
            <p className="download-file">
              {job.fileName}
            </p>
          )}
        </div>

        <div className="download-actions">
          {active && (
            <button
              type="button"
              className="icon-button download-action"
              title={t("downloads.cancel")}
              aria-label={t("downloads.cancel")}
              onClick={() =>
                window.aniPlay &&
                invoke(window.aniPlay.downloads.cancel(job.id))
              }
            >
              <X size={16} />
            </button>
          )}

          {canRetry && (
            <button
              type="button"
              className="icon-button download-action"
              title={t("downloads.retry")}
              aria-label={t("downloads.retry")}
              onClick={() =>
                window.aniPlay &&
                invoke(window.aniPlay.downloads.retry(job.id))
              }
            >
              <RefreshCw size={16} />
            </button>
          )}

          {job.status === "completed" && (
            <button
              type="button"
              className="icon-button download-action"
              title={t("downloads.showInFolder")}
              aria-label={t("downloads.showInFolder")}
              onClick={() =>
                window.aniPlay &&
                invoke(window.aniPlay.downloads.reveal(job.id))
              }
            >
              <FolderOpen size={16} />
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="downloads-page">
      <header className="downloads-header">
        <div>
          <div className="downloads-eyebrow">
            {t("downloads.label")}
          </div>

          <h1 className="downloads-title">
            {t("downloads.heading")}
          </h1>

          <div className="downloads-subtitle">
            <span>
              {activeCount
                ? t("downloads.activeQueued", {
                  count: activeCount,
                })
                : t("downloads.noActive")}
            </span>

            <span className="downloads-subtitle-separator">·</span>

            <span className="downloads-directory">
              {state?.settings.directory ?? t("downloads.loadingFolder")}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="icon-button downloads-clear"
          onClick={() =>
            window.aniPlay &&
            invoke(window.aniPlay.downloads.clearFinished())
          }
          title={t("downloads.clearFinished")}
          aria-label={t("downloads.clearFinished")}
        >
          <Trash2 size={17} />
        </button>
      </header>

      {state && !state.ffmpegAvailable && (
        <div className="downloads-alert" role="alert">
          <AlertCircle size={18} />

          <div>
            <p className="downloads-alert-title">
              {t("downloads.ffmpegUnavailable")}
            </p>

            <p className="downloads-alert-message">
              {state.ffmpegError}
            </p>
          </div>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="downloads-empty">
          <div className="downloads-empty-icon">
            <Download size={24} />
          </div>

          <h2>{t("downloads.emptyTitle")}</h2>

          <p>{t("downloads.emptyBody")}</p>
        </div>
      ) : (
        <div className="downloads-content">
          {activeJobs.length > 0 && (
            <section className="download-section">
              <div className="download-section-header">
                <h2>
                  {t("downloads.sections.active", {
                    defaultValue: "Active",
                  })}
                </h2>

                <span>{activeJobs.length}</span>
              </div>

              <div className="download-list">
                {activeJobs.map(renderJob)}
              </div>
            </section>
          )}

          {completedJobs.length > 0 && (
            <section className="download-section">
              <div className="download-section-header">
                <h2>
                  {t("downloads.sections.completed", {
                    defaultValue: "Completed",
                  })}
                </h2>

                <span>{completedJobs.length}</span>
              </div>

              <div className="download-list">
                {completedJobs.map(renderJob)}
              </div>
            </section>
          )}

          {otherJobs.length > 0 && (
            <section className="download-section">
              <div className="download-section-header">
                <h2>
                  {t("downloads.sections.other", {
                    defaultValue: "Needs attention",
                  })}
                </h2>

                <span>{otherJobs.length}</span>
              </div>

              <div className="download-list">
                {otherJobs.map(renderJob)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}