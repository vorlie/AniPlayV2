import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import {
  ArrowLeft,
  Download,
  Gauge,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  Server,
  Sparkles,
  Upload,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { addHistory } from "../lib/history";
import type { CatalogProvider } from "../catalog-types";
import type { TranslationType } from "../download-types";
import {
  shouldWarnAboutUncontrollableAnikotoSource,
  watchTogetherContentMatches,
} from "../lib/watch-together-content";
import { useWatchTogether } from "../contexts/WatchTogetherContext";
import { WatchTogetherCompanion } from "../components/aniplay/PlayerControls/WatchTogetherCompanion";
import type { TorrentSessionState } from "../torrent-types";
import { getNextSubtitleTrackIndex } from "../lib/player-subtitles";

interface StreamLink {
  url: string;
  resolution: string;
  hls: boolean;
  provider: string;
  downloadable: boolean;
  subtitles?: { label: string; url: string }[];
  embed?: boolean;
  torrent?: boolean;
}

interface PlayerPageProps {
  links: StreamLink[];
  title: string;
  onBack: () => void;
  mode?: "overlay" | "embedded";
  animeId?: string;
  animeName?: string;
  episode?: string;
  translationType?: TranslationType;
  initialResumeSeconds?: number | null;
  aniListMediaId?: number;
  coverUrl?: string;
  catalogProvider?: CatalogProvider;
}

const SAVE_THROTTLE_MS = 5000;
const PRESENCE_SYNC_MS = 15000;
const WATCH_CHECKPOINT_MS = 5 * 60_000;
const ROOM_CHECKPOINT_MS = 15_000;

function toResumeSeconds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, value);
}

function clampProgress(progressSeconds: number, durationSeconds?: number) {
  if (!Number.isFinite(progressSeconds) || progressSeconds < 0) return 0;
  if (
    typeof durationSeconds === "number" &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0
  ) {
    return Math.min(progressSeconds, durationSeconds);
  }
  return progressSeconds;
}

function formatTime(s: number) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${sec}`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function seekToResumePosition(
  video: HTMLVideoElement,
  progressSeconds: number,
  durationSeconds?: number,
) {
  const target = clampProgress(progressSeconds, durationSeconds);
  if (target <= 0) return false;
  if (video.readyState < 1 && !Number.isFinite(video.duration)) return false;
  try {
    video.currentTime = target;
    return true;
  } catch {
    return false;
  }
}

function embedOrigin(link: StreamLink | undefined) {
  if (!link?.embed) return null;
  try {
    return new URL(link.url).origin;
  } catch {
    return null;
  }
}

function parseEmbedMessage(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function finiteSeconds(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function PlayerPage({
  links,
  title,
  onBack,
  mode = "overlay",
  animeId,
  animeName,
  episode,
  translationType = "sub",
  initialResumeSeconds,
  aniListMediaId,
  coverUrl,
  catalogProvider = "anikoto",
}: PlayerPageProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const seekedRef = useRef(false);
  const lastSavedAtRef = useRef(0);
  const latestTimeRef = useRef(0);
  const latestDurationRef = useRef(0);
  const lastPresenceAtRef = useRef(0);
  const playingRef = useRef(false);
  const watchSegmentRef = useRef<{
    startedAt: number;
    fromSeconds: number;
  } | null>(null);
  const applyingRoomPlaybackRef = useRef(false);
  const lastRoomRevisionRef = useRef(-1);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showServers, setShowServers] = useState(false);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [useNativeControls, setUseNativeControls] = useState(() => {
    try {
      const saved = localStorage.getItem("player.useNativeControls");
      return saved == null ? true : saved !== "false";
    } catch {
      return true;
    }
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPip, setIsPip] = useState(false);
  const [captionTrackIndex, setCaptionTrackIndex] = useState(() =>
    links[0]?.subtitles?.length ? 0 : -1,
  );
  const [downloadStatus, setDownloadStatus] = useState<
    "idle" | "starting" | "queued" | "error"
  >("idle");
  const {
    state: watchTogetherState,
    companionOpen,
    unreadCount,
    setCompanionOpen,
    updatePlayback,
    setReady,
  } = useWatchTogether();
  const [roomAutoplayBlocked, setRoomAutoplayBlocked] = useState(false);
  const [torrentState, setTorrentState] = useState<TorrentSessionState | null>(
    null,
  );

  const activeLink = links[activeIdx];
  const availableSubtitles = activeLink?.subtitles ?? [];
  const resolvedCaptionTrackIndex =
    availableSubtitles.length === 0
      ? -1
      : Math.min(Math.max(captionTrackIndex, 0), availableSubtitles.length - 1);
  const resumeSeconds = useMemo(
    () => toResumeSeconds(initialResumeSeconds),
    [initialResumeSeconds],
  );
  const isEmbedLink = Boolean(activeLink?.embed);
  const activeEmbedOrigin = useMemo(
    () => embedOrigin(activeLink),
    [activeLink],
  );
  const roomMatchesPlayer = Boolean(
    watchTogetherState?.connected &&
    !activeLink?.torrent &&
    watchTogetherContentMatches(
      watchTogetherState.content,
      catalogProvider,
      animeId,
      episode,
      translationType,
    ),
  );
  const roomGuestLocked =
    roomMatchesPlayer && watchTogetherState?.role === "guest";
  const anikotoRoomSourceUnavailable =
    roomMatchesPlayer &&
    shouldWarnAboutUncontrollableAnikotoSource(catalogProvider, links);

  useEffect(() => {
    if (!activeLink?.torrent || !window.aniPlay) return;
    void window.aniPlay.torrent.getState().then(setTorrentState);
    return window.aniPlay.torrent.onChanged(setTorrentState);
  }, [activeLink?.torrent]);

  useEffect(() => {
    if (!roomMatchesPlayer || !activeLink?.embed) return;
    const directIndex = links.findIndex((link) => !link.embed);
    if (directIndex < 0 || directIndex === activeIdx) return;
    const selectDirectSource = window.setTimeout(
      () => setActiveIdx(directIndex),
      0,
    );
    return () => window.clearTimeout(selectDirectSource);
  }, [activeIdx, activeLink?.embed, links, roomMatchesPlayer]);

  const sendRoomPlayback = useCallback(
    (video: HTMLVideoElement) => {
      if (
        !roomMatchesPlayer ||
        watchTogetherState?.role !== "host" ||
        applyingRoomPlaybackRef.current
      )
        return;
      void updatePlayback({
        position: Math.max(0, video.currentTime || 0),
        paused: video.paused,
        duration:
          Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : undefined,
        revision: 0, // The room server assigns the authoritative revision.
      }).catch(() => {});
    },
    [roomMatchesPlayer, updatePlayback, watchTogetherState?.role],
  );

  useEffect(() => {
    const video = videoRef.current;
    const playback = watchTogetherState?.playback;
    if (
      !video ||
      !roomGuestLocked ||
      !playback ||
      activeLink?.embed ||
      playback.revision <= lastRoomRevisionRef.current
    )
      return;
    lastRoomRevisionRef.current = playback.revision;
    const updatedAt = playback.updatedAt
      ? Date.parse(playback.updatedAt)
      : Date.now();
    const elapsedSeconds =
      playback.paused || !Number.isFinite(updatedAt)
        ? 0
        : Math.max(0, (Date.now() - updatedAt) / 1000);
    const target = Math.max(
      0,
      Math.min(
        playback.duration ?? Number.POSITIVE_INFINITY,
        playback.position + elapsedSeconds,
      ),
    );
    const drift = target - video.currentTime;
    applyingRoomPlaybackRef.current = true;
    if (Math.abs(drift) > 1.5) {
      video.currentTime = target;
      video.playbackRate = 1;
    } else {
      video.playbackRate = Math.abs(drift) < 0.35 ? 1 : drift > 0 ? 1.03 : 0.97;
    }
    if (playback.paused) video.pause();
    else
      void video
        .play()
        .then(() => {
          setRoomAutoplayBlocked(false);
          return setReady(true);
        })
        .catch(() => {
          setRoomAutoplayBlocked(true);
          return setReady(false);
        });
    const release = window.setTimeout(() => {
      applyingRoomPlaybackRef.current = false;
    }, 300);
    const resetRate = window.setTimeout(() => {
      video.playbackRate = 1;
    }, 5_000);
    return () => {
      window.clearTimeout(release);
      window.clearTimeout(resetRate);
    };
  }, [
    activeLink?.embed,
    roomGuestLocked,
    setReady,
    watchTogetherState?.playback,
  ]);

  useEffect(() => {
    if (!roomMatchesPlayer) return;
    void setReady(
      Boolean(
        activeLink &&
        !activeLink.embed &&
        videoRef.current?.readyState &&
        videoRef.current.readyState >= 2,
      ),
    ).catch(() => {});
    return () => {
      void setReady(false).catch(() => {});
    };
  }, [activeLink, roomMatchesPlayer, setReady]);

  useEffect(() => {
    if (!roomMatchesPlayer || watchTogetherState?.role !== "host") return;
    const video = videoRef.current;
    if (video && !activeLink?.embed) sendRoomPlayback(video);
    const timer = window.setInterval(() => {
      const currentVideo = videoRef.current;
      if (currentVideo && !activeLink?.embed) sendRoomPlayback(currentVideo);
    }, ROOM_CHECKPOINT_MS);
    return () => window.clearInterval(timer);
  }, [
    activeLink?.embed,
    roomMatchesPlayer,
    sendRoomPlayback,
    watchTogetherState?.role,
  ]);

  const saveProgress = useCallback(
    (force = false) => {
      if (!animeId || !animeName || !episode) return;
      const progressSeconds = clampProgress(
        latestTimeRef.current,
        latestDurationRef.current || undefined,
      );
      if (!force && progressSeconds <= 0) return;

      const now = Date.now();
      if (!force && now - lastSavedAtRef.current < SAVE_THROTTLE_MS) return;

      lastSavedAtRef.current = now;
      addHistory({
        animeId,
        animeName,
        episode,
        progressSeconds,
        durationSeconds:
          latestDurationRef.current > 0 ? latestDurationRef.current : undefined,
        aniListMediaId,
        coverUrl,
        catalogProvider,
      });
    },
    [animeId, animeName, episode, aniListMediaId, coverUrl, catalogProvider],
  );

  const startWatchSegment = useCallback(() => {
    if (
      !window.aniPlay ||
      !animeId ||
      !animeName ||
      !episode ||
      watchSegmentRef.current
    )
      return;
    watchSegmentRef.current = {
      startedAt: Date.now(),
      fromSeconds: latestTimeRef.current,
    };
  }, [animeId, animeName, episode]);

  const flushWatchSegment = useCallback(
    (completed = false, restart = false) => {
      const now = Date.now();
      const segment =
        watchSegmentRef.current ??
        (completed
          ? {
              startedAt: now - 1000,
              fromSeconds: Math.max(0, latestTimeRef.current - 1),
            }
          : null);
      watchSegmentRef.current = null;
      if (segment && window.aniPlay && animeId && animeName && episode) {
        const endedAt = now;
        const activeSeconds = Math.max(0, (endedAt - segment.startedAt) / 1000);
        if (activeSeconds >= (completed ? 1 : 10)) {
          void window.aniPlay.viewing
            .append({
              startedAt: segment.startedAt,
              endedAt,
              activeSeconds,
              timezoneOffsetMinutes: new Date(
                segment.startedAt,
              ).getTimezoneOffset(),
              animeId,
              animeName,
              episode,
              catalogProvider,
              aniListMediaId,
              fromSeconds: segment.fromSeconds,
              toSeconds: latestTimeRef.current,
              durationSeconds:
                latestDurationRef.current > 0
                  ? latestDurationRef.current
                  : undefined,
              completed,
            })
            .catch(() => {});
        }
      }
      if (restart && playingRef.current) startWatchSegment();
    },
    [
      animeId,
      animeName,
      episode,
      catalogProvider,
      aniListMediaId,
      startWatchSegment,
    ],
  );

  const updatePresence = useCallback(
    (playing: boolean, force = false) => {
      if (!window.aniPlay || !animeName || !episode) return;
      const now = Date.now();
      if (!force && now - lastPresenceAtRef.current < PRESENCE_SYNC_MS) return;
      lastPresenceAtRef.current = now;
      void window.aniPlay.discordPresence
        .update({
          animeName,
          episode,
          translationType,
          currentTime: latestTimeRef.current,
          duration:
            latestDurationRef.current > 0
              ? latestDurationRef.current
              : undefined,
          playing,
          aniListMediaId,
          coverUrl,
        })
        .catch(() => {});
    },
    [animeName, episode, translationType, aniListMediaId, coverUrl],
  );

  useEffect(() => {
    if (!videoRef.current) return;
    updatePresence(!videoRef.current.paused, true);
  }, [updatePresence]);

  useEffect(() => {
    if (!isEmbedLink || !activeEmbedOrigin) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== activeEmbedOrigin) return;
      const data = parseEmbedMessage(event.data);
      if (!data || typeof data !== "object") return;
      const payload = data as Record<string, unknown>;
      const time = finiteSeconds(payload.time ?? payload.currentTime);
      const nextDuration = finiteSeconds(payload.duration);

      if (time !== null) {
        latestTimeRef.current = time;
        if (nextDuration !== null && nextDuration > 0)
          latestDurationRef.current = nextDuration;
        setCurrentTime(latestTimeRef.current);
        setDuration(latestDurationRef.current);
        setIsPlaying(true);
        if (!playingRef.current) {
          playingRef.current = true;
          startWatchSegment();
        }
        saveProgress(false);
        updatePresence(true, false);
      }

      if (payload.event === "complete") {
        if (nextDuration !== null && nextDuration > 0) {
          latestTimeRef.current = nextDuration;
          latestDurationRef.current = nextDuration;
        }
        setCurrentTime(latestTimeRef.current);
        setDuration(latestDurationRef.current);
        setIsPlaying(false);
        playingRef.current = false;
        flushWatchSegment(true);
        saveProgress(true);
        void window.aniPlay?.discordPresence.clear().catch(() => {});
      }
      if (payload.event === "pause") {
        playingRef.current = false;
        setIsPlaying(false);
        flushWatchSegment(false);
      }
    };

    window.addEventListener("message", handleMessage);
    updatePresence(true, true);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    activeEmbedOrigin,
    flushWatchSegment,
    isEmbedLink,
    saveProgress,
    startWatchSegment,
    updatePresence,
  ]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "player.useNativeControls") {
        setUseNativeControls(
          e.newValue == null ? true : e.newValue !== "false",
        );
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const syncSubtitleTracks = useCallback(() => {
    const video = videoRef.current;
    if (!video || availableSubtitles.length === 0) return;
    for (const [index, track] of Array.from(video.textTracks ?? []).entries()) {
      track.mode = index === resolvedCaptionTrackIndex ? "showing" : "hidden";
    }
  }, [availableSubtitles.length, resolvedCaptionTrackIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !availableSubtitles.length) return;
    syncSubtitleTracks();
    video.addEventListener("loadedmetadata", syncSubtitleTracks);
    video.addEventListener("loadeddata", syncSubtitleTracks);
    return () => {
      video.removeEventListener("loadedmetadata", syncSubtitleTracks);
      video.removeEventListener("loadeddata", syncSubtitleTracks);
    };
  }, [availableSubtitles.length, syncSubtitleTracks]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeLink || activeLink.embed) return;
    setFailed((prev) => {
      const next = new Set(prev);
      next.delete(activeIdx);
      return next;
    });

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const applyResumePosition = () => {
      if (seekedRef.current || resumeSeconds == null) return;
      const target = clampProgress(resumeSeconds, video.duration);
      if (target <= 0) {
        seekedRef.current = true;
        return;
      }
      if (seekToResumePosition(video, target, video.duration)) {
        seekedRef.current = true;
      }
    };

    const handleLoadedMetadata = () => {
      applyResumePosition();
      if (roomMatchesPlayer) void setReady(true).catch(() => {});
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);

    if (activeLink.hls && Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(activeLink.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        applyResumePosition();
        if (roomMatchesPlayer) void setReady(true).catch(() => {});
        video.play().catch(() => {});
      });
    } else {
      video.src = activeLink.url;
      video.load();
      applyResumePosition();
      video.play().catch(() => {});
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeIdx, activeLink, resumeSeconds, roomMatchesPlayer, setReady]);

  useEffect(() => {
    const onPipEnter = () => setIsPip(true);
    const onPipLeave = () => setIsPip(false);
    document.addEventListener(
      "enterpictureinpicture",
      onPipEnter as EventListener,
    );
    document.addEventListener(
      "leavepictureinpicture",
      onPipLeave as EventListener,
    );
    return () => {
      document.removeEventListener(
        "enterpictureinpicture",
        onPipEnter as EventListener,
      );
      document.removeEventListener(
        "leavepictureinpicture",
        onPipLeave as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    const checkpoint = window.setInterval(() => {
      if (playingRef.current) flushWatchSegment(false, true);
    }, WATCH_CHECKPOINT_MS);
    return () => window.clearInterval(checkpoint);
  }, [flushWatchSegment]);

  useEffect(() => {
    const flushFinal = () => {
      saveProgress(true);
      playingRef.current = false;
      flushWatchSegment(false);
    };
    const flushVisibilityCheckpoint = () => {
      if (document.visibilityState !== "hidden") return;
      saveProgress(true);
      flushWatchSegment(false, true);
    };
    window.addEventListener("pagehide", flushFinal);
    window.addEventListener("beforeunload", flushFinal);
    document.addEventListener("visibilitychange", flushVisibilityCheckpoint);
    return () => {
      window.removeEventListener("pagehide", flushFinal);
      window.removeEventListener("beforeunload", flushFinal);
      document.removeEventListener(
        "visibilitychange",
        flushVisibilityCheckpoint,
      );
      saveProgress(true);
      playingRef.current = false;
      flushWatchSegment(false);
      void window.aniPlay?.discordPresence.clear().catch(() => {});
    };
  }, [flushWatchSegment, saveProgress]);

  const tryNextServer = () => {
    setFailed((prev) => {
      const next = new Set(prev);
      next.add(activeIdx);
      return next;
    });
    for (let i = 1; i < links.length; i++) {
      const idx = (activeIdx + i) % links.length;
      if (!failed.has(idx)) {
        setActiveIdx(idx);
        return;
      }
    }
  };

  const isOverlay = mode === "overlay";

  const handleTimeUpdate = (video: HTMLVideoElement) => {
    latestTimeRef.current = video.currentTime || 0;
    latestDurationRef.current =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : latestDurationRef.current;
    setCurrentTime(latestTimeRef.current);
    setDuration(latestDurationRef.current);
    saveProgress(false);
    updatePresence(!video.paused, false);
  };

  const handleDurationChange = (video: HTMLVideoElement) => {
    latestDurationRef.current =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : 0;
    setDuration(latestDurationRef.current);
    updatePresence(!video.paused, true);
  };

  const handlePlaying = (video: HTMLVideoElement) => {
    latestTimeRef.current = video.currentTime || 0;
    latestDurationRef.current =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : latestDurationRef.current;
    setIsPlaying(true);
    setRoomAutoplayBlocked(false);
    playingRef.current = true;
    startWatchSegment();
    updatePresence(true, true);
    if (roomMatchesPlayer) void setReady(true).catch(() => {});
    sendRoomPlayback(video);
  };

  const handlePause = (video: HTMLVideoElement) => {
    latestTimeRef.current = video.currentTime || 0;
    latestDurationRef.current =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : latestDurationRef.current;
    setIsPlaying(false);
    playingRef.current = false;
    flushWatchSegment(false);
    saveProgress(true);
    updatePresence(false, true);
    sendRoomPlayback(video);
  };

  const handleEnded = (video: HTMLVideoElement) => {
    latestTimeRef.current =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : video.currentTime || 0;
    latestDurationRef.current =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : latestDurationRef.current;
    setIsPlaying(false);
    playingRef.current = false;
    setCurrentTime(latestTimeRef.current);
    saveProgress(true);
    flushWatchSegment(true);
    void window.aniPlay?.discordPresence.clear().catch(() => {});
    if (activeLink?.torrent) void window.aniPlay?.torrent.stop();
  };

  const togglePlay = () => {
    if (roomGuestLocked) return;
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const setVideoVolume = (v: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(1, v));
    video.volume = clamped;
    video.muted = clamped === 0;
    setVolume(clamped);
    setMuted(video.muted);
  };

  const seek = (t: number) => {
    if (roomGuestLocked) return;
    const video = videoRef.current;
    if (!video) return;
    const wasPlaying = !video.paused;
    flushWatchSegment(false);
    const nextTime = Math.max(0, Math.min(duration || 0, t));
    video.currentTime = nextTime;
    latestTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    if (wasPlaying) {
      playingRef.current = true;
      startWatchSegment();
    }
    updatePresence(!video.paused, true);
    sendRoomPlayback(video);
  };

  const skipForward = () => {
    const video = videoRef.current;
    if (!video) return;
    seek(video.currentTime + 85);
  };

  const enterFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.requestFullscreen) video.requestFullscreen().catch(() => {});
  };

  const togglePip = async () => {
    const video = videoRef.current as
      | (HTMLVideoElement & { disablePictureInPicture?: boolean })
      | null;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }
      if (!document.pictureInPictureEnabled || video.disablePictureInPicture)
        return;
      await video.requestPictureInPicture();
    } catch {
      // Silently ignore when provider/browser blocks PiP for this stream
    }
  };

  const handleBack = () => {
    if (
      roomMatchesPlayer &&
      !window.confirm(t("watchTogether.leavePlaybackConfirm"))
    )
      return;
    saveProgress(true);
    playingRef.current = false;
    flushWatchSegment(false);
    onBack();
  };

  const startDownload = async () => {
    if (
      !window.aniPlay ||
      !activeLink?.downloadable ||
      !animeId ||
      !animeName ||
      !episode ||
      downloadStatus === "starting"
    )
      return;
    setDownloadStatus("starting");
    const result = await window.aniPlay.downloads.start({
      animeId,
      animeName,
      episode,
      translationType,
      catalogProvider,
      provider: activeLink.provider,
      resolution: activeLink.resolution,
      durationSeconds: duration > 0 ? duration : undefined,
    });
    setDownloadStatus(result.success ? "queued" : "error");
    if (result.success) setTimeout(() => setDownloadStatus("idle"), 2500);
  };

  return (
    <div
      className={`player-shell ${
        watchTogetherState?.code && !isOverlay
          ? "player-shell--watch-together"
          : ""
      }`}
    >
      <div
        className={`player-container ${
          isOverlay ? "player-container--overlay" : ""
        } ${
          watchTogetherState?.code && !isOverlay
            ? "player-container--watch-together"
            : ""
        }`}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <header
          className={`player-header ${
            isOverlay ? "player-header--overlay" : ""
          }`}
        >
          <div className="player-header-main">
            <button
              type="button"
              onClick={handleBack}
              className="player-back-button"
              aria-label={t("player.back")}
            >
              <ArrowLeft size={20} />
            </button>

            <div className="player-title">
              <span className="player-title-kicker">
                {t("player.nowPlaying")}
              </span>

              <h2>{title}</h2>
            </div>
          </div>

          <div className="player-header-actions">
            {watchTogetherState?.code && !isOverlay ? (
              <button
                type="button"
                onClick={() => setCompanionOpen(!companionOpen)}
                className="player-action player-action--companion"
                aria-expanded={companionOpen}
                aria-label={t("watchTogether.openCompanion")}
              >
                <MessageSquare size={16} />

                <span>{t("watchTogether.chat")}</span>

                {unreadCount > 0 ? (
                  <span className="player-unread-badge">{unreadCount}</span>
                ) : null}
              </button>
            ) : null}

            {!isOverlay ? (
              <div className="player-persistent">
                <Sparkles size={13} />
                <span>{t("player.persistent")}</span>
              </div>
            ) : null}

            {activeLink?.downloadable ? (
              <button
                type="button"
                onClick={() => void startDownload()}
                disabled={
                  !activeLink ||
                  !animeId ||
                  !animeName ||
                  !episode ||
                  downloadStatus === "starting"
                }
                title={
                  downloadStatus === "error"
                    ? t("player.downloadError")
                    : t("player.downloadCurrent")
                }
                className="player-action"
              >
                {downloadStatus === "starting" ? (
                  <Loader2 className="player-spinner" size={16} />
                ) : (
                  <Download size={16} />
                )}

                <span>
                  {downloadStatus === "queued"
                    ? t("player.queued")
                    : t("player.download")}
                </span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setShowServers((value) => !value)}
              className={`player-action player-server-toggle ${
                showServers ? "player-server-toggle--active" : ""
              }`}
            >
              <Server size={16} />
              <span>{t("player.servers", { count: links.length })}</span>
            </button>
          </div>
        </header>

        {anikotoRoomSourceUnavailable ? (
          <div
            role="alert"
            className={`player-alert player-alert--warning ${
              isOverlay ? "player-alert--overlay" : ""
            }`}
          >
            <div className="player-alert-icon">
              <Sparkles size={15} />
            </div>

            <span>{t("watchTogether.anikotoDirectUnavailable")}</span>
          </div>
        ) : null}

        {activeLink?.torrent && torrentState ? (
          <div
            className="player-torrent-stats"
            aria-label={t("torrent.sessionStats")}
          >
            <div className="player-torrent-stat">
              <Users size={14} />
              <span>
                <strong>{torrentState.peers}</strong>
                {t("torrent.peers")}
              </span>
            </div>

            <div className="player-torrent-stat">
              <Download size={14} />
              <span>
                <strong>{formatBytes(torrentState.downloadSpeed)}</strong>/s
              </span>
            </div>

            <div className="player-torrent-stat">
              <Upload size={14} />
              <span>
                <strong>{formatBytes(torrentState.uploadSpeed)}</strong>/s
              </span>
            </div>

            <div className="player-torrent-stat">
              <Gauge size={14} />
              <span>
                <strong>{Math.round(torrentState.progress * 100)}%</strong>
              </span>
            </div>
          </div>
        ) : null}

        <div
          className={`player-stage ${isOverlay ? "player-stage--overlay" : ""}`}
        >
          {roomGuestLocked && roomAutoplayBlocked ? (
            <button
              type="button"
              className="player-autoplay-prompt"
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;

                void video
                  .play()
                  .then(() => {
                    setRoomAutoplayBlocked(false);
                    return setReady(true);
                  })
                  .catch(() => {});
              }}
            >
              <Play size={18} />
              {t("watchTogether.autoplayBlocked")}
            </button>
          ) : null}

          {isEmbedLink ? (
            <iframe
              src={activeLink.url}
              className="player-embed"
              allow="autoplay; fullscreen; picture-in-picture"
              title={title}
            />
          ) : (
            <video
              ref={videoRef}
              crossOrigin={
                activeLink?.subtitles?.length ? "anonymous" : undefined
              }
              className="player-video"
              controls={useNativeControls && !roomGuestLocked}
              autoPlay
              onError={tryNextServer}
              onPlaying={(event) => handlePlaying(event.currentTarget)}
              onWaiting={() => {
                playingRef.current = false;
                flushWatchSegment(false);

                if (roomMatchesPlayer) {
                  void setReady(false).catch(() => {});
                }
              }}
              onPause={(event) => handlePause(event.currentTarget)}
              onEnded={(event) => handleEnded(event.currentTarget)}
              onTimeUpdate={(event) => handleTimeUpdate(event.currentTarget)}
              onDurationChange={(event) =>
                handleDurationChange(event.currentTarget)
              }
              onVolumeChange={(event) => {
                const video = event.target as HTMLVideoElement;
                setVolume(video.volume);
                setMuted(video.muted);
              }}
            >
              {activeLink?.subtitles?.map((track, index) => (
                <track
                  key={`${track.url}:${index}`}
                  src={track.url}
                  label={track.label}
                  kind="captions"
                  default={index === 0}
                />
              ))}
            </video>
          )}
        </div>

        {!isEmbedLink && !useNativeControls ? (
          <div
            className={`player-controls ${
              isOverlay ? "player-controls--overlay" : ""
            }`}
          >
            <div className="player-controls-main">
              <button
                type="button"
                onClick={togglePlay}
                className="player-control-button player-control-button--primary"
                aria-label={isPlaying ? t("player.pause") : t("player.play")}
              >
                {isPlaying ? <Pause size={17} /> : <Play size={17} />}
              </button>

              <button
                type="button"
                onClick={skipForward}
                className="player-control-button player-control-button--secondary"
              >
                +85s
              </button>

              {availableSubtitles.length > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setCaptionTrackIndex((current) =>
                      getNextSubtitleTrackIndex(
                        current,
                        availableSubtitles.length,
                      ),
                    )
                  }
                  className="player-control-button player-control-button--compact"
                  title={
                    resolvedCaptionTrackIndex >= 0
                      ? (availableSubtitles[resolvedCaptionTrackIndex]?.label ??
                        "Closed captions")
                      : "Closed captions off"
                  }
                >
                  {resolvedCaptionTrackIndex >= 0 ? "CC" : "CC OFF"}
                </button>
              ) : null}

              <button
                type="button"
                onClick={toggleMute}
                className="player-control-button"
                aria-label={
                  muted || volume === 0 ? t("player.unmute") : t("player.mute")
                }
              >
                {muted || volume === 0 ? (
                  <VolumeX size={17} />
                ) : (
                  <Volume2 size={17} />
                )}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(event) => setVideoVolume(Number(event.target.value))}
                className="player-volume"
                aria-label={t("player.volume")}
              />

              <span className="player-time">
                {formatTime(currentTime)}
                <span>/</span>
                {formatTime(duration)}
              </span>

              <button
                type="button"
                onClick={enterFullscreen}
                className="player-control-button player-control-button--utility"
                aria-label={t("player.fullscreen")}
              >
                <Maximize2 size={17} />
              </button>

              <button
                type="button"
                onClick={togglePip}
                className="player-control-button player-control-button--utility"
                title={t("player.pictureInPicture")}
                aria-label={t("player.pictureInPicture")}
              >
                {isPip ? (
                  <Minimize2 size={17} />
                ) : (
                  <PictureInPicture2 size={17} />
                )}
              </button>
            </div>

            <input
              type="range"
              min={0}
              max={Math.max(duration, 0)}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              onChange={(event) => seek(Number(event.target.value))}
              className="player-progress"
              aria-label={t("player.seek")}
            />
          </div>
        ) : null}

        {showServers ? (
          <section
            className={`player-server-panel ${
              isOverlay ? "player-server-panel--overlay" : ""
            }`}
          >
            <div className="player-server-panel-header">
              <div>
                <span className="player-panel-eyebrow">
                  {t("player.servers", { count: links.length })}
                </span>

                <h3>{t("player.selectServer")}</h3>
              </div>

              <Server size={18} />
            </div>

            <div className="player-server-list">
              {links.map((link, index) => (
                <button
                  type="button"
                  key={index}
                  onClick={() => {
                    setActiveIdx(index);
                    setCaptionTrackIndex(0);
                    setShowServers(false);
                  }}
                  className={`player-server ${
                    index === activeIdx ? "player-server--active" : ""
                  }`}
                >
                  <span className="player-server-provider">
                    {link.provider}
                  </span>

                  <span className="player-server-resolution">
                    {link.resolution}
                  </span>

                  {link.hls ? (
                    <span className="player-server-type">HLS</span>
                  ) : null}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {watchTogetherState?.code && !isOverlay ? (
        <WatchTogetherCompanion />
      ) : null}
    </div>
  );
}
