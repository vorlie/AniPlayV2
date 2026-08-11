import { useEffect, useState } from "react";
import { CheckCircle2, Sparkles, Users, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CatalogProvider } from "../../../catalog-types";
import type { WatchTogetherCreateContext } from "../../../watch-together-types";
import { useWatchTogether } from "../../../contexts/WatchTogetherContext";

interface WatchTogetherSetupDialogProps {
  anime?: {
    id: string;
    name: string;
    episodes: number;
    aniListMediaId?: number;
    coverUrl?: string;
    catalogProvider: CatalogProvider;
  };
  context: WatchTogetherCreateContext | null;
  isOpen: boolean;
  onOpenChange: (next: boolean) => void;
}

export function WatchTogetherSetupDialog({
  anime,
  context,
  isOpen,
  onOpenChange,
}: WatchTogetherSetupDialogProps) {
  const { t } = useTranslation();
  const { inviteCode, clearInvite, createRoom, joinRoom } =
    useWatchTogether();

  const [joinCode, setJoinCode] = useState(inviteCode ?? "");
  const [configAvailable, setConfigAvailable] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canCreate = Boolean(
    context?.controllable &&
      configAvailable &&
      authenticated &&
      window.aniPlay?.watchTogether,
  );

  useEffect(() => {
    if (!isOpen || !window.aniPlay?.watchTogether) return;

    void window.aniPlay.watchTogether
      .getConfig()
      .then((config) => {
        setConfigAvailable(config.available);
        setConfigMessage(config.message);
      })
      .catch(() => setConfigMessage(t("watchTogether.unavailable")));

    void window.aniPlay.aniList.auth
      .status()
      .then((session) => setAuthenticated(session.authenticated))
      .catch(() => setAuthenticated(false));
  }, [isOpen, t]);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (inviteCode) {
      setJoinCode(inviteCode);
    }
  }, [inviteCode]);

  const close = () => {
    clearInvite();
    onOpenChange(false);
  };

  const handleCreate = async () => {
    if (!context) return;

    setIsBusy(true);
    setErrorMessage(null);

    try {
      await createRoom({
        content: context.content,
        playback: context.playback,
      });

      close();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t("watchTogether.createFailed"),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoin = async () => {
    setIsBusy(true);
    setErrorMessage(null);

    try {
      await joinRoom({ code: joinCode });
      close();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t("watchTogether.joinFailed"),
      );
    } finally {
      setIsBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="watch-together-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="watch-together-setup-title"
        className="watch-together-dialog"
      >
        <header className="watch-together-header">
          <div>
            <p className="watch-together-eyebrow">
              <Users size={13} />
              {t("watchTogether.title")}
            </p>

            <h2
              id="watch-together-setup-title"
              className="watch-together-title"
            >
              {t("watchTogether.setupTitle")}
            </h2>

            {anime ? (
              <p className="watch-together-subtitle">
                {t("watchTogether.roomFor", {
                  name: anime.name,
                })}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            className="watch-together-close"
            onClick={close}
            aria-label={t("watchTogether.closePanel")}
          >
            <X size={18} />
          </button>
        </header>

        <div className="watch-together-body">
          {errorMessage ? (
            <div
              role="alert"
              className="watch-together-error"
            >
              {errorMessage}
            </div>
          ) : null}

          <div className="watch-together-grid">
            {/* Create */}
            <article className="watch-together-option watch-together-create">
              <div className="watch-together-option-header">
                <div className="watch-together-option-icon">
                  <Sparkles size={17} />
                </div>

                <div>
                  <p className="watch-together-option-label">
                    {t("watchTogether.createRoom")}
                  </p>

                  <h3 className="watch-together-option-title">
                    {anime
                      ? t("watchTogether.roomFor", {
                          name: anime.name,
                        })
                      : t("watchTogether.createRoom")}
                  </h3>
                </div>
              </div>

              <p className="watch-together-option-description">
                {t("watchTogether.createHint")}
              </p>

              <div className="watch-together-status-list">
                {!authenticated ? (
                  <div className="watch-together-status warning">
                    <span className="watch-together-status-dot" />
                    {t("watchTogether.signInRequired")}
                  </div>
                ) : (
                  <div className="watch-together-status">
                    <CheckCircle2 size={14} />
                    {t("watchTogether.signInRequired").replace(
                      /^./,
                      (character) => character.toUpperCase(),
                    )}
                  </div>
                )}

                {context && !context.controllable ? (
                  <div className="watch-together-status warning">
                    <span className="watch-together-status-dot" />
                    {t("watchTogether.directSourceRequired")}
                  </div>
                ) : null}

                {configMessage ? (
                  <div className="watch-together-status">
                    <span className="watch-together-status-dot" />
                    {configMessage}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                disabled={!canCreate || isBusy}
                onClick={() => void handleCreate()}
                className="watch-together-primary"
              >
                {isBusy
                  ? t("watchTogether.working")
                  : t("watchTogether.createRoom")}
              </button>
            </article>

            {/* Join */}
            <article className="watch-together-option watch-together-join">
              <div className="watch-together-option-header">
                <div className="watch-together-option-icon">
                  <Users size={17} />
                </div>

                <div>
                  <p className="watch-together-option-label">
                    {t("watchTogether.joinRoom")}
                  </p>

                  <h3 className="watch-together-option-title">
                    {t("watchTogether.joinTitle")}
                  </h3>
                </div>
              </div>

              <p className="watch-together-option-description">
                {t("watchTogether.joinHint")}
              </p>

              <label className="watch-together-code-field">
                <span className="watch-together-code-label">
                  {t("watchTogether.codePlaceholder")}
                </span>

                <input
                  value={joinCode}
                  onChange={(event) =>
                    setJoinCode(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^0-9A-HJKMNP-TV-Z]/g, ""),
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      authenticated &&
                      !isBusy &&
                      joinCode.length === 10
                    ) {
                      void handleJoin();
                    }
                  }}
                  placeholder="XXXXXXXXXX"
                  maxLength={10}
                  autoFocus={Boolean(inviteCode)}
                  className="watch-together-code-input"
                />
              </label>

              <button
                type="button"
                disabled={
                  isBusy ||
                  !authenticated ||
                  joinCode.length !== 10
                }
                onClick={() => void handleJoin()}
                className="watch-together-secondary"
              >
                {t("watchTogether.joinRoom")}
              </button>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}
