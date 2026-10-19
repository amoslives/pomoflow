import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  ListMusic,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Video,
  VideoOff,
} from 'lucide-react';
import { formatTime } from '../utils/timer';
import { parseStoredJson } from '../utils/storage';
import {
  parseYouTubeSource,
  getNextTrackIndex,
  getPrevTrackIndex,
  fetchYouTubeVideoMetadata,
  YouTubeVideoMetadata,
  RepeatMode,
} from '../utils/youtube';

// Declare YT for window
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface TrackItem {
  id: string;
  title: string;
  sourceType: 'youtube-video' | 'youtube-playlist';
  youtubeId?: string;
  playlistId?: string;
  author?: string;
}

interface NativePlaylistTrack {
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  metadataLoaded: boolean;
}

interface SavedPlayback {
  trackId: string;
  position: number;
  playlistIndex: number;
}

interface LoadSourceOptions {
  autoplay?: boolean;
  startSeconds?: number;
  playlistIndex?: number;
}

const PLAYLIST_METADATA_BATCH_SIZE = 25;

function fallbackTrackTitle(sourceType: TrackItem['sourceType']): string {
  return sourceType === 'youtube-playlist' ? 'Saved YouTube playlist' : 'Saved YouTube track';
}

function removeGeneratedIdTitle(track: TrackItem): TrackItem {
  const rawId = track.sourceType === 'youtube-playlist' ? track.playlistId : track.youtubeId;
  const oldGeneratedTitle = track.sourceType === 'youtube-playlist'
    ? `YouTube Playlist: ${rawId}`
    : `YouTube Track: ${rawId}`;
  return track.title === oldGeneratedTitle
    ? { ...track, title: fallbackTrackTitle(track.sourceType) }
    : track;
}

function normalizeQueue(value: unknown): TrackItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is TrackItem => {
    if (!item || typeof item !== 'object') return false;
    const track = item as Partial<TrackItem>;
    if (typeof track.id !== 'string' || typeof track.title !== 'string') return false;
    if (!['youtube-video', 'youtube-playlist'].includes(track.sourceType || '')) return false;
    if (track.sourceType === 'youtube-video') return typeof track.youtubeId === 'string';
    if (track.sourceType === 'youtube-playlist') return typeof track.playlistId === 'string';
    return false;
  }).map(removeGeneratedIdTitle);
}

function normalizeSavedPlayback(value: unknown, queue: TrackItem[]): SavedPlayback | null {
  if (!value || typeof value !== 'object') return null;
  const playback = value as Partial<SavedPlayback>;
  if (
    typeof playback.trackId !== 'string'
    || !queue.some((track) => track.id === playback.trackId)
    || typeof playback.position !== 'number'
    || !Number.isFinite(playback.position)
    || playback.position < 0
    || playback.position > 7 * 24 * 60 * 60
  ) return null;
  return {
    trackId: playback.trackId,
    position: playback.position,
    playlistIndex: typeof playback.playlistIndex === 'number' && Number.isInteger(playback.playlistIndex)
      ? Math.max(-1, playback.playlistIndex)
      : -1,
  };
}

interface AudioPlayerProps {
  // Slim player for views that are not about music; it stays mounted so playback continues
  compact?: boolean;
}

export function AudioPlayer({ compact = false }: AudioPlayerProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [inputTitle, setInputTitle] = useState('');
  const [queue, setQueue] = useState<TrackItem[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pomodoro_music_queue');
      if (saved) return normalizeQueue(parseStoredJson(saved));
    }
    return [];
  });
  const restoredPlaybackRef = useRef(
    normalizeSavedPlayback(parseStoredJson(localStorage.getItem('pomodoro_music_playback')), queue)
  );
  const restoredPlayback = restoredPlaybackRef.current;

  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(() => {
    if (!restoredPlayback) return 0;
    const index = queue.findIndex((track) => track.id === restoredPlayback.trackId);
    return index >= 0 ? index : 0;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(restoredPlayback?.position || 0);
  const [duration, setDuration] = useState(0);
  const [liveTitle, setLiveTitle] = useState<string>('');
  const [playedIds, setPlayedIds] = useState<string[]>([]);
  const [youtubeEnabled, setYoutubeEnabled] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(null);
  const [nativePlaylistTracks, setNativePlaylistTracks] = useState<NativePlaylistTrack[]>([]);
  const [nativePlaylistIndex, setNativePlaylistIndex] = useState(restoredPlayback?.playlistIndex ?? -1);
  const [isPlaylistMetadataLoading, setIsPlaylistMetadataLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreview, setSeekPreview] = useState(restoredPlayback?.position || 0);

  const ytPlayerRef = useRef<any>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const pendingTrackRef = useRef<{ track: TrackItem; options: LoadSourceOptions } | null>(null);
  const handleNextTrackRef = useRef<() => void>(() => {});
  const resumePositionRef = useRef(restoredPlayback?.position || 0);
  const queueRef = useRef(queue);
  const currentTrackIndexRef = useRef(currentTrackIndex);
  const repeatModeRef = useRef(repeatMode);
  const failedTrackIdsRef = useRef<Set<string>>(new Set());
  const playTrackAtIndexRef = useRef<(index: number) => void>(() => {});
  const playlistMetadataCacheRef = useRef<Map<string, YouTubeVideoMetadata | null>>(new Map());
  const playlistSyncGenerationRef = useRef(0);
  const activeSourceRef = useRef<{ track: TrackItem; options: LoadSourceOptions } | null>(null);
  const repeatingPlaylistIndexRef = useRef<number | null>(null);
  const settingsRef = useRef({ volume, isMuted, isShuffle, repeatMode });
  settingsRef.current = { volume, isMuted, isShuffle, repeatMode };
  const showVideoRef = useRef(showVideo);
  showVideoRef.current = showVideo && !compact;
  const transportRef = useRef<HTMLDivElement>(null);

  const currentTrack: TrackItem | undefined = queue[currentTrackIndex];
  // There is no video to show until YouTube has loaded a track
  const hasVideo = youtubeEnabled && Boolean(currentTrack);
  const isVideoShown = showVideo && hasVideo && !compact;

  useEffect(() => {
    queueRef.current = queue;
    currentTrackIndexRef.current = currentTrackIndex;
    repeatModeRef.current = repeatMode;
  }, [queue, currentTrackIndex, repeatMode]);

  // Save queue
  useEffect(() => {
    localStorage.setItem('pomodoro_music_queue', JSON.stringify(queue));
  }, [queue]);

  useEffect(() => {
    if (!currentTrack || isLive) {
      localStorage.removeItem('pomodoro_music_playback');
      return;
    }
    localStorage.setItem('pomodoro_music_playback', JSON.stringify({
      trackId: currentTrack.id,
      position: Math.max(0, currentTime),
      playlistIndex: nativePlaylistIndex,
    } satisfies SavedPlayback));
  }, [currentTrack, currentTime, nativePlaylistIndex, isLive]);

  // Load YouTube Iframe API once
  useEffect(() => {
    if (!youtubeEnabled) return;
    if (window.YT && window.YT.Player) {
      setApiReady(true);
      return;
    }

    const previousOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (previousOnReady) previousOnReady();
      setApiReady(true);
    };

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
    return () => { window.onYouTubeIframeAPIReady = previousOnReady; };
  }, [youtubeEnabled]);

  useEffect(() => () => {
    try { ytPlayerRef.current?.destroy?.(); } catch {}
    ytPlayerRef.current = null;
  }, []);

  // Update volume
  useEffect(() => {
    const effectiveVol = isMuted ? 0 : volume;
    if (ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
      try {
        ytPlayerRef.current.setVolume(effectiveVol);
        if (isMuted && typeof ytPlayerRef.current.mute === 'function') {
          ytPlayerRef.current.mute();
        } else if (!isMuted && typeof ytPlayerRef.current.unMute === 'function') {
          ytPlayerRef.current.unMute();
        }
      } catch {}
    }
  }, [volume, isMuted]);

  const hydrateNativePlaylistMetadata = useCallback(async (
    videoIds: string[],
    generation: number = playlistSyncGenerationRef.current
  ) => {
    const missingIds = videoIds
      .filter((videoId) => !playlistMetadataCacheRef.current.has(videoId))
      .slice(0, PLAYLIST_METADATA_BATCH_SIZE);

    if (missingIds.length === 0) return;
    setIsPlaylistMetadataLoading(true);

    const results = await Promise.all(
      missingIds.map(async (videoId) => ({
        videoId,
        metadata: await fetchYouTubeVideoMetadata(videoId),
      }))
    );

    if (generation !== playlistSyncGenerationRef.current) return;

    for (const { videoId, metadata } of results) {
      playlistMetadataCacheRef.current.set(videoId, metadata);
    }

    setNativePlaylistTracks((current) => current.map((track) => {
      const metadata = playlistMetadataCacheRef.current.get(track.videoId);
      return {
        ...track,
        title: metadata?.title || track.title,
        author: metadata?.author || track.author,
        thumbnailUrl: metadata?.thumbnailUrl || track.thumbnailUrl,
        metadataLoaded: playlistMetadataCacheRef.current.has(track.videoId),
      };
    }));
    setIsPlaylistMetadataLoading(false);
  }, []);

  const syncNativePlaylist = useCallback((player: any) => {
    try {
      const videoIds = typeof player.getPlaylist === 'function'
        ? (player.getPlaylist() || []).filter((id: unknown): id is string => typeof id === 'string')
        : [];
      if (videoIds.length === 0) return;

      const generation = ++playlistSyncGenerationRef.current;
      const tracks = videoIds.map((videoId: string, index: number): NativePlaylistTrack => {
        const metadata = playlistMetadataCacheRef.current.get(videoId);
        return {
          videoId,
          title: metadata?.title || `Track ${index + 1}`,
          author: metadata?.author || 'YouTube',
          thumbnailUrl: metadata?.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          metadataLoaded: playlistMetadataCacheRef.current.has(videoId),
        };
      });

      setNativePlaylistTracks(tracks);
      if (typeof player.getPlaylistIndex === 'function') {
        setNativePlaylistIndex(player.getPlaylistIndex());
      }
      void hydrateNativePlaylistMetadata(videoIds, generation);
    } catch {}
  }, [hydrateNativePlaylistMetadata]);

  // Play next track
  const handleNextTrack = useCallback(() => {
    repeatingPlaylistIndexRef.current = null;
    if (queue.length === 0) return;

    // If native YT playlist is playing and has multiple tracks, try native nextVideo
    if (currentTrack?.sourceType === 'youtube-playlist' && ytPlayerRef.current && typeof ytPlayerRef.current.nextVideo === 'function') {
      try {
        const playlist = typeof ytPlayerRef.current.getPlaylist === 'function' ? ytPlayerRef.current.getPlaylist() || [] : [];
        const playlistIndex = typeof ytPlayerRef.current.getPlaylistIndex === 'function' ? ytPlayerRef.current.getPlaylistIndex() : -1;
        if (repeatMode === 'off' && playlist.length > 0 && playlistIndex >= playlist.length - 1) {
          setIsPlaying(false);
          return;
        }
        ytPlayerRef.current.nextVideo();
        return;
      } catch {}
    }

    const unplayed = queue
      .map((_, i) => i)
      .filter((i) => !playedIds.includes(queue[i]!.id) && i !== currentTrackIndex);

    const nextIndex = getNextTrackIndex(
      currentTrackIndex,
      queue.length,
      isShuffle,
      repeatMode,
      unplayed
    );

    if (nextIndex < 0) {
      setIsPlaying(false);
      return;
    }

    if (isShuffle && unplayed.length === 0) setPlayedIds(currentTrack ? [currentTrack.id] : []);
    setPlaybackError('');
    playTrackAtIndex(nextIndex);
  }, [queue, currentTrackIndex, isShuffle, repeatMode, playedIds, currentTrack]);

  useEffect(() => {
    handleNextTrackRef.current = handleNextTrack;
  }, [handleNextTrack]);

  // Play previous track
  const handlePrevTrack = useCallback(() => {
    repeatingPlaylistIndexRef.current = null;
    if (queue.length === 0) return;

    if (currentTrack?.sourceType === 'youtube-playlist' && ytPlayerRef.current && typeof ytPlayerRef.current.previousVideo === 'function') {
      try {
        ytPlayerRef.current.previousVideo();
        return;
      } catch {}
    }

    const prevIndex = getPrevTrackIndex(currentTrackIndex, queue.length, repeatMode);
    playTrackAtIndex(prevIndex);
  }, [queue, currentTrackIndex, repeatMode, currentTrack]);

  // Play track at specified index
  const playTrackAtIndex = (index: number, queueOverride?: TrackItem[], autoplay = true) => {
    const effectiveQueue = queueOverride ?? queue;
    if (index < 0 || index >= effectiveQueue.length) return;
    setCurrentTrackIndex(index);
    const track = effectiveQueue[index];
    if (!track) return;
    queueRef.current = effectiveQueue;
    currentTrackIndexRef.current = index;
    setPlayedIds(previous => previous.includes(track.id) ? previous : [...previous, track.id]);
    setCurrentTime(0);
    setDuration(0);
    setLiveTitle('');
    setSeekPreview(0);
    setIsLive(false);
    setPlaybackError('');
    resumePositionRef.current = 0;

    playlistSyncGenerationRef.current += 1;
    setNativePlaylistTracks([]);
    setNativePlaylistIndex(-1);
    setIsPlaylistMetadataLoading(false);

    if (track.sourceType === 'youtube-playlist') {
      setExpandedPlaylistId(track.id);
    }

    loadYouTubeSource(track, { autoplay });
  };

  const loadYouTubeSource = (track: TrackItem, options: LoadSourceOptions = {}) => {
    repeatingPlaylistIndexRef.current = null;
    setYoutubeEnabled(true);
    setPlayedIds(previous => previous.includes(track.id) ? previous : [...previous, track.id]);
    activeSourceRef.current = { track, options };
    const autoplay = options.autoplay !== false;
    const startSeconds = Math.max(0, options.startSeconds || 0);
    const playlistIndex = Math.max(0, options.playlistIndex || 0);
    if (!window.YT || !window.YT.Player) {
      pendingTrackRef.current = { track, options };
      return;
    }
    pendingTrackRef.current = null;

    const onPlayerReady = (event: any) => {
      if (event.target !== ytPlayerRef.current) return;
      const active = activeSourceRef.current;
      if (!active) return;
      const startSeconds = Math.max(0, active.options.startSeconds || 0);
      const autoplay = active.options.autoplay !== false;
      const { volume, isMuted, isShuffle, repeatMode } = settingsRef.current;
      if (active.track.id !== track.id) {
        loadYouTubeSource(active.track, active.options);
        return;
      }
      event.target.setVolume(isMuted ? 0 : volume);
      if (isShuffle && typeof event.target.setShuffle === 'function') {
        event.target.setShuffle(true);
      }
      if (repeatMode === 'all' && typeof event.target.setLoop === 'function') {
        event.target.setLoop(true);
      }
      if (startSeconds > 0 && typeof event.target.seekTo === 'function') {
        event.target.seekTo(startSeconds, true);
      }
      setCurrentTime(startSeconds);
      setSeekPreview(startSeconds);
      resumePositionRef.current = startSeconds;
      if (typeof event.target.getDuration === 'function') {
        setDuration(event.target.getDuration() || 0);
      }
      if (autoplay) {
        if (showVideoRef.current) document.getElementById('youtube-player-host')?.scrollIntoView({ block: 'center' });
        event.target.playVideo();
        setIsPlaying(true);
      } else {
        event.target.pauseVideo?.();
        setIsPlaying(false);
      }
      if (active.track.sourceType === 'youtube-playlist') {
        syncNativePlaylist(event.target);
      }
    };

    const onPlayerStateChange = (event: any) => {
      if (event.target !== ytPlayerRef.current || !activeSourceRef.current) return;
      // 1 = playing, 2 = paused, 0 = ended
      if (event.data === 1) {
        const repeatingIndex = repeatingPlaylistIndexRef.current;
        repeatingPlaylistIndexRef.current = null;
        if (repeatModeRef.current === 'one' && repeatingIndex !== null
          && event.target.getPlaylistIndex?.() !== repeatingIndex) {
          event.target.playVideoAt?.(repeatingIndex);
          return;
        }
        setIsPlaying(true);
        setPlaybackError('');
        const playingTrack = queueRef.current[currentTrackIndexRef.current];
        if (playingTrack) failedTrackIdsRef.current.delete(playingTrack.id);
        syncNativePlaylist(event.target);
        try {
          const videoData = event.target.getVideoData();
          setIsLive(Boolean(videoData?.isLive));
          if (videoData && videoData.title) {
            setLiveTitle(videoData.title);
          }
        } catch {}
      } else if (event.data === 2) {
        setIsPlaying(false);
      } else if (event.data === 5) {
        const startSeconds = Math.max(0, activeSourceRef.current.options.startSeconds || 0);
        setIsPlaying(false);
        setCurrentTime(startSeconds);
        setSeekPreview(startSeconds);
        setDuration(event.target.getDuration?.() || 0);
      } else if (event.data === 0) {
        if (repeatModeRef.current === 'one') {
          if (activeSourceRef.current.track.sourceType === 'youtube-playlist') {
            const index = event.target.getPlaylistIndex?.() ?? -1;
            if (index >= 0) {
              repeatingPlaylistIndexRef.current = index;
              event.target.playVideoAt?.(index);
            }
          }
          event.target.seekTo(0, true);
          event.target.playVideo();
        } else handleNextTrackRef.current();
      }
    };

    const onError = (event: any) => {
      if (event.target !== ytPlayerRef.current || !activeSourceRef.current) return;
      if (activeSourceRef.current.track.sourceType === 'youtube-playlist') {
        try {
          const playlist = event.target.getPlaylist?.() || [];
          const index = event.target.getPlaylistIndex?.() ?? -1;
          if (index >= 0 && index < playlist.length - 1) {
            event.target.nextVideo();
            return;
          }
        } catch {}
      }

      const failedIndex = currentTrackIndexRef.current;
      const currentQueue = queueRef.current;
      const failedTrack = currentQueue[failedIndex];
      if (failedTrack) failedTrackIdsRef.current.add(failedTrack.id);
      const candidates = currentQueue
        .map((_, index) => index)
        .filter((index) => !failedTrackIdsRef.current.has(currentQueue[index]?.id || ''))
        .filter((index) => repeatModeRef.current !== 'off' || index > failedIndex);
      if (candidates.length === 0) {
        setIsPlaying(false);
        setPlaybackError('This video is unavailable and there are no more playable tracks.');
        return;
      }
      const nextCandidate = candidates[0];
      if (nextCandidate !== undefined) playTrackAtIndexRef.current(nextCandidate);
    };

    // If player already exists, use existing instance methods
    if (ytPlayerRef.current && typeof ytPlayerRef.current.loadVideoById === 'function') {
      try {
        if (autoplay && showVideoRef.current) document.getElementById('youtube-player-host')?.scrollIntoView({ block: 'center' });
        if (track.sourceType === 'youtube-playlist' && track.playlistId) {
          const playlistOptions = {
            list: track.playlistId,
            listType: 'playlist',
            index: playlistIndex,
            startSeconds,
          };
          if (!autoplay && typeof ytPlayerRef.current.cuePlaylist === 'function') {
            ytPlayerRef.current.cuePlaylist(playlistOptions);
          } else {
            ytPlayerRef.current.loadPlaylist(playlistOptions);
          }
        } else if (track.youtubeId) {
          const videoOptions = { videoId: track.youtubeId, startSeconds };
          if (!autoplay && typeof ytPlayerRef.current.cueVideoById === 'function') {
            ytPlayerRef.current.cueVideoById(videoOptions);
          } else {
            ytPlayerRef.current.loadVideoById(videoOptions);
          }
        }
        if (autoplay) {
          ytPlayerRef.current.playVideo();
          setIsPlaying(true);
        } else {
          ytPlayerRef.current.pauseVideo?.();
          setIsPlaying(false);
        }
        return;
      } catch {}
    }

    // Destroy prior player if needed
    if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === 'function') {
      try {
        ytPlayerRef.current.destroy();
      } catch {}
    }

    const playerConfig: any = {
      height: '270',
      width: '100%',
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        autoplay: autoplay ? 1 : 0,
        controls: 1,
        playsinline: 1,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        start: Math.floor(startSeconds),
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onError: onError,
      },
    };

    if (track.sourceType === 'youtube-playlist' && track.playlistId) {
      playerConfig.playerVars.listType = 'playlist';
      playerConfig.playerVars.list = track.playlistId;
      playerConfig.playerVars.index = playlistIndex;
    } else if (track.youtubeId) {
      playerConfig.videoId = track.youtubeId;
    }

    try {
      const host = document.getElementById('youtube-player-host');
      if (!host) return;
      const element = document.createElement('div');
      host.replaceChildren(element);
      ytPlayerRef.current = new window.YT.Player(element, playerConfig);
    } catch {}
  };

  useEffect(() => {
    playTrackAtIndexRef.current = playTrackAtIndex;
  });

  useEffect(() => {
    if (apiReady && pendingTrackRef.current) {
      const pending = pendingTrackRef.current;
      loadYouTubeSource(pending.track, pending.options);
      return;
    }
  }, [apiReady]);

  // Sync playback time & duration
  useEffect(() => {
    if (isPlaying) {
      timerIntervalRef.current = window.setInterval(() => {
        if (currentTrack && ytPlayerRef.current) {
          try {
            if (typeof ytPlayerRef.current.getCurrentTime === 'function') {
              const curr = ytPlayerRef.current.getCurrentTime() || 0;
              const dur = ytPlayerRef.current.getDuration() || 0;
              resumePositionRef.current = curr;
              if (!isSeeking) setCurrentTime(curr);
              setDuration(dur);
            }
            if (typeof ytPlayerRef.current.getVideoData === 'function') {
              const data = ytPlayerRef.current.getVideoData();
              setIsLive(Boolean(data?.isLive));
              if (data && data.title && data.title !== liveTitle) {
                setLiveTitle(data.title);
              }
            }
            if (typeof ytPlayerRef.current.getPlaylistIndex === 'function') {
              setNativePlaylistIndex(ytPlayerRef.current.getPlaylistIndex());
            }
          } catch {}
        }
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isPlaying, currentTrack, liveTitle, isSeeking]);

  // Toggle Play / Pause
  const handleTogglePlayPause = () => {
    setYoutubeEnabled(true);
    if (!currentTrack) {
      if (queue.length > 0) {
        playTrackAtIndex(0);
      }
      return;
    }

    if (isPlaying) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {}
      }
      setIsPlaying(false);
    } else {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === 'function') {
        try {
          const playerState = typeof ytPlayerRef.current.getPlayerState === 'function'
            ? ytPlayerRef.current.getPlayerState()
            : null;
          if (
            resumePositionRef.current > 0
            && (playerState === -1 || playerState === 5)
            && typeof ytPlayerRef.current.seekTo === 'function'
          ) {
            ytPlayerRef.current.seekTo(resumePositionRef.current, true);
          }
          ytPlayerRef.current.playVideo();
          setIsPlaying(true);
        } catch {
          playTrackAtIndex(currentTrackIndex);
        }
      } else {
        loadYouTubeSource(currentTrack, { startSeconds: resumePositionRef.current, playlistIndex: nativePlaylistIndex });
      }
    }
  };

  // Stop Playback
  const handleStop = () => {
    if (ytPlayerRef.current && typeof ytPlayerRef.current.stopVideo === 'function') {
      try {
        ytPlayerRef.current.stopVideo();
      } catch {}
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setSeekPreview(0);
    resumePositionRef.current = 0;
  };

  // Toggle Shuffle
  const handleToggleShuffle = () => {
    const nextShuffle = !isShuffle;
    setIsShuffle(nextShuffle);
    if (ytPlayerRef.current && typeof ytPlayerRef.current.setShuffle === 'function') {
      try {
        ytPlayerRef.current.setShuffle(nextShuffle);
      } catch {}
    }
  };

  // Show or hide the video while the media bar keeps playing
  const handleToggleVideo = () => {
    const next = !showVideo;
    showVideoRef.current = next;
    setShowVideo(next);
    if (next) {
      window.requestAnimationFrame(() => {
        document.getElementById('youtube-player-host')?.scrollIntoView({ block: 'nearest' });
        // The video pushes the controls down; keep them on screen if both do not fit
        transportRef.current?.scrollIntoView({ block: 'nearest' });
      });
    }
  };

  // Cycle Repeat Mode: off -> all -> one
  const handleCycleRepeat = () => {
    repeatingPlaylistIndexRef.current = null;
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    const nextIdx = (modes.indexOf(repeatMode) + 1) % modes.length;
    const nextMode = modes[nextIdx] ?? 'off';
    setRepeatMode(nextMode);

    if (ytPlayerRef.current && typeof ytPlayerRef.current.setLoop === 'function') {
      try {
        ytPlayerRef.current.setLoop(nextMode === 'all');
      } catch {}
    }
  };

  // Add source (song or playlist) to queue
  const handleAddSource = (e: React.FormEvent) => {
    e.preventDefault();
    const source = parseYouTubeSource(urlInput);
    if (!source) return;

    const newTrack: TrackItem = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: inputTitle.trim() || fallbackTrackTitle(source.type === 'playlist' ? 'youtube-playlist' : 'youtube-video'),
      sourceType: source.type === 'playlist' ? 'youtube-playlist' : 'youtube-video',
      youtubeId: source.type === 'video' ? source.id : undefined,
      playlistId: source.type === 'playlist' ? source.id : undefined,
      author: 'YouTube',
    };

    setQueue((prev) => [newTrack, ...prev]);
    setUrlInput('');
    setInputTitle('');
    setShowSettings(false);
    if (newTrack.sourceType === 'youtube-playlist') {
      setExpandedPlaylistId(newTrack.id);
    } else if (!inputTitle.trim() && newTrack.youtubeId) {
      void fetchYouTubeVideoMetadata(newTrack.youtubeId).then((metadata) => {
        if (!metadata) return;
        setQueue((current) => current.map((track) =>
          track.id === newTrack.id
            ? { ...track, title: metadata.title, author: metadata.author }
            : track
        ));
      });
    }
    playTrackAtIndex(0, [newTrack, ...queue]);
  };

  // Remove track from queue
  const handleRemoveTrack = (id: string, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextQueue = queue.filter(track => track.id !== id);
    queueRef.current = nextQueue;
    setQueue(nextQueue);
    setPlayedIds(previous => previous.filter(played => played !== id));
    failedTrackIdsRef.current.delete(id);
    if (index === currentTrackIndex) {
      handleStop();
      activeSourceRef.current = null;
      pendingTrackRef.current = null;
      setLiveTitle('');
      setDuration(0);
      setIsLive(false);
      setPlaybackError('');
      playlistSyncGenerationRef.current += 1;
      setNativePlaylistTracks([]);
      setNativePlaylistIndex(-1);
      if (nextQueue.length) {
        const nextIndex = Math.min(index, nextQueue.length - 1);
        if (youtubeEnabled) playTrackAtIndex(nextIndex, nextQueue, false);
        else { currentTrackIndexRef.current = nextIndex; setCurrentTrackIndex(nextIndex); }
      }
      else {
        try { ytPlayerRef.current?.destroy?.(); } catch {}
        ytPlayerRef.current = null;
        currentTrackIndexRef.current = 0;
        setCurrentTrackIndex(0);
      }
    } else if (index < currentTrackIndex) {
      currentTrackIndexRef.current = currentTrackIndex - 1;
      setCurrentTrackIndex((prev) => Math.max(0, prev - 1));
    }
    if (expandedPlaylistId === id) setExpandedPlaylistId(null);
  };

  const handlePlayNativePlaylistTrack = (index: number) => {
    repeatingPlaylistIndexRef.current = null;
    if (!ytPlayerRef.current || typeof ytPlayerRef.current.playVideoAt !== 'function') return;
    try {
      ytPlayerRef.current.playVideoAt(index);
      setNativePlaylistIndex(index);
      setCurrentTime(0);
      setIsPlaying(true);
    } catch {}
  };

  const displayTitle = liveTitle || currentTrack?.title || 'No track loaded';
  const displayedTime = isSeeking ? seekPreview : currentTime;
  const seekPercent = duration > 0 ? Math.min(100, Math.max(0, (displayedTime / duration) * 100)) : 0;

  const commitSeek = (nextTime: number) => {
    const clampedTime = Math.min(duration, Math.max(0, nextTime));
    setCurrentTime(clampedTime);
    setSeekPreview(clampedTime);
    resumePositionRef.current = clampedTime;
    setIsSeeking(false);
    if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
      try {
        ytPlayerRef.current.seekTo(clampedTime, true);
      } catch {}
    }
  };

  const playControls = (
    <div className="flex items-center gap-1">
      <button type="button" onClick={handlePrevTrack} aria-label="Previous track" title="Previous track" className="btn btn-icon">
        <SkipBack className="fill-current" />
      </button>
      <button
        type="button"
        onClick={handleTogglePlayPause}
        aria-label={isPlaying ? 'Pause music' : 'Play music'}
        title={isPlaying ? 'Pause' : 'Play'}
        className={`btn btn-icon !px-4 ${isPlaying ? 'is-on' : ''}`}
      >
        {isPlaying ? <Pause className="fill-current" /> : <Play className="fill-current" />}
      </button>
      <button type="button" onClick={handleStop} aria-label="Stop playback" title="Stop playback" className="btn btn-icon">
        <Square className="fill-current" />
      </button>
      <button type="button" onClick={handleNextTrack} aria-label="Next track" title="Next track" className="btn btn-icon">
        <SkipForward className="fill-current" />
      </button>
    </div>
  );

  return (
    <section className="window w-full mt-5 font-pixel select-none" aria-label="Music player" hidden={compact && !currentTrack}>
      <div className="titlebar">
        <span className="titlebar-box left" aria-hidden="true" />
        <span className="titlebar-title">Jukebox</span>
        <span className="titlebar-box right" aria-hidden="true" />
      </div>

      <div className="window-body !pt-3 !pb-3">
        <div
          id="youtube-player-host"
          className={`w-full overflow-hidden ${isVideoShown ? 'mb-3' : 'h-0'}`}
          inert={!isVideoShown}
          aria-hidden={!isVideoShown}
        />
        {/* Load panel */}
        {showSettings && !compact && (
          <form onSubmit={handleAddSource} className="groupbox mb-4 mt-3">
            <div className="groupbox-label">Load from YouTube</div>
            <input
              type="text"
              name="source-url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste YouTube video URL, video ID or playlist URL"
              className="field field-sm mb-2"
              aria-label="YouTube URL, video ID or playlist URL"
            />
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                name="source-label"
                value={inputTitle}
                onChange={(e) => setInputTitle(e.target.value)}
                placeholder="Label (optional)"
                className="field field-sm"
                aria-label="Custom label for this source"
              />
              <button type="submit" disabled={!urlInput.trim()} className="btn btn-sm btn-default">
                Load & play
              </button>
              <button type="button" onClick={() => setShowSettings(false)} className="btn btn-sm">
                Cancel
              </button>
            </div>
            <p className="dim text-base mt-2">Playing connects to YouTube, which may collect data and cookies.</p>
          </form>
        )}

        {/* Queue panel */}
        {showPlaylist && !compact && (
          <div className="groupbox mb-4 mt-3">
            <div className="groupbox-label">Current Playlist & Queue ({queue.length})</div>
            <div className="groupbox-tools">
              <button type="button" onClick={() => setShowPlaylist(false)} className="btn btn-sm btn-icon" aria-label="Close queue">
                <ChevronDown strokeWidth={3} />
              </button>
            </div>

            {queue.length === 0 ? (
              <p className="dim text-lg py-2 text-center">The queue is empty. Press Load to add a video or playlist.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {queue.map((track, idx) => {
                  const isPlaylist = track.sourceType === 'youtube-playlist';
                  const isExpanded = isPlaylist && expandedPlaylistId === track.id;
                  const isCurrent = idx === currentTrackIndex;

                  return (
                    <div key={track.id} className={`list-row flex-col !items-stretch !gap-0 !p-0 ${isCurrent ? 'is-selected' : ''}`}>
                      <div className="flex items-center gap-2 px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (isPlaylist) {
                              setExpandedPlaylistId(isExpanded ? null : track.id);
                            } else {
                              playTrackAtIndex(idx);
                            }
                          }}
                          aria-label={isPlaylist ? `${isExpanded ? 'Collapse' : 'Expand'} ${track.title}` : `Play ${track.title}`}
                          aria-expanded={isPlaylist ? isExpanded : undefined}
                          className="min-w-0 flex-1 flex items-center gap-2 text-left cursor-pointer text-lg"
                        >
                          <span className="w-5 flex-shrink-0 text-center font-data text-lg">
                            {isPlaylist
                              ? (isExpanded ? <ChevronDown className="w-4 h-4" strokeWidth={3} /> : <ChevronRight className="w-4 h-4" strokeWidth={3} />)
                              : (isCurrent && isPlaying ? '>' : `${idx + 1}`)}
                          </span>
                          <span className="truncate">{track.title}</span>
                          {isPlaylist && <span className="badge !text-xs flex-shrink-0">Playlist</span>}
                        </button>

                        <div className="flex items-center gap-1">
                          {isPlaylist && (
                            <button
                              type="button"
                              onClick={() => playTrackAtIndex(idx)}
                              aria-label={`Play ${track.title}`}
                              title="Play playlist from the beginning"
                              className="btn btn-icon btn-ghost !text-current"
                            >
                              <Play className="fill-current" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => handleRemoveTrack(track.id, idx, e)}
                            aria-label={`Remove ${track.title}`}
                            className="btn btn-icon btn-ghost !text-current"
                          >
                            <Trash2 strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t-2 border-dotted border-current px-2 py-1.5">
                          {!isCurrent ? (
                            <p className="py-1 text-base opacity-80">Play this playlist to load its songs.</p>
                          ) : nativePlaylistTracks.length === 0 ? (
                            <p className="py-1 text-base opacity-80">Loading playlist songs...</p>
                          ) : (
                            <>
                              <div>
                                {nativePlaylistTracks.map((playlistTrack, playlistIndex) => (
                                  <button
                                    key={`${playlistTrack.videoId}-${playlistIndex}`}
                                    type="button"
                                    onClick={() => handlePlayNativePlaylistTrack(playlistIndex)}
                                    aria-label={`Play playlist track ${playlistIndex + 1}: ${playlistTrack.title}`}
                                    className={`w-full flex items-center gap-2 px-1 py-1 text-left cursor-pointer border-2 ${
                                      playlistIndex === nativePlaylistIndex ? 'border-current' : 'border-transparent hover:border-current'
                                    }`}
                                  >
                                    <span className="w-6 flex-shrink-0 text-center font-data text-lg">
                                      {playlistIndex === nativePlaylistIndex && isPlaying ? '>' : playlistIndex + 1}
                                    </span>
                                    <img
                                      src={playlistTrack.thumbnailUrl}
                                      alt=""
                                      loading="lazy"
                                      className="w-12 h-7 object-cover flex-shrink-0 border border-current grayscale contrast-150"
                                    />
                                    <span className="min-w-0">
                                      <span className="block truncate text-base">{playlistTrack.title}</span>
                                      <span className="block truncate text-sm opacity-70">{playlistTrack.author}</span>
                                    </span>
                                  </button>
                                ))}
                              </div>

                              {nativePlaylistTracks.some((trackItem) => !trackItem.metadataLoaded) && (
                                <button
                                  type="button"
                                  onClick={() => void hydrateNativePlaylistMetadata(nativePlaylistTracks.map((trackItem) => trackItem.videoId))}
                                  disabled={isPlaylistMetadataLoading}
                                  className="btn btn-sm w-full mt-2 !text-current !bg-transparent !border-current"
                                >
                                  {isPlaylistMetadataLoading ? 'Loading titles...' : 'Load more titles'}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Now playing, with Load beside it, or the play controls in compact mode */}
        <div className="flex items-center gap-2">
          <div className="field field-sm font-data text-lg truncate !bg-transparent flex-1" aria-live="polite">
            {currentTrack ? (
              <>
                <span className="font-pixel text-sm mr-2">{isPlaying ? 'Playing' : 'Loaded'}</span>
                <span>{displayTitle}</span>
              </>
            ) : (
              <span className="dim">No track loaded. Press Load to add one.</span>
            )}
          </div>
          {compact ? playControls : (
            <button
              type="button"
              onClick={() => {
                setShowSettings(!showSettings);
                setShowPlaylist(false);
              }}
              aria-label="Load from YouTube"
              aria-pressed={showSettings}
              title="Load a YouTube video or playlist"
              className="btn btn-sm"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              <span>Load</span>
            </button>
          )}
        </div>

        {!compact && <>
          {/* Seek */}
          <div className="flex items-center gap-3 mt-2">
            <span className="font-data text-lg w-12 text-right">{isLive ? 'LIVE' : formatTime(displayedTime)}</span>
            <input
              type="range"
              name="seek"
              min="0"
              max={duration || 100}
              step="1"
              value={isLive ? 0 : displayedTime}
              onPointerDown={() => {
                setSeekPreview(currentTime);
                setIsSeeking(true);
              }}
              onChange={(e) => {
                const newTime = Number(e.target.value);
                setSeekPreview(newTime);
                setIsSeeking(true);
              }}
              onPointerUp={(e) => commitSeek(Number(e.currentTarget.value))}
              onKeyUp={(e) => commitSeek(Number(e.currentTarget.value))}
              onBlur={(e) => isSeeking && commitSeek(Number(e.currentTarget.value))}
              disabled={!currentTrack || isLive || duration <= 0}
              className="slider slider-seek slider-thin flex-1"
              style={{ '--seek-progress': `${seekPercent}%` } as React.CSSProperties}
              aria-label={isLive ? 'Live stream progress is not seekable' : 'Seek through current track'}
              aria-valuetext={isLive ? 'Live' : `${formatTime(displayedTime)} of ${formatTime(duration)}`}
            />
            <span className="font-data text-lg w-12">{isLive ? 'LIVE' : formatTime(duration)}</span>
          </div>

          {/* Transport */}
          <div ref={transportRef} className="flex flex-wrap items-center gap-2 mt-3">
            {playControls}

            <div className="flex items-center gap-1 ml-1">
              <button
                type="button"
                onClick={handleToggleShuffle}
                aria-label={isShuffle ? 'Disable shuffle mode' : 'Enable shuffle mode'}
                aria-pressed={isShuffle}
                title={isShuffle ? 'Shuffle: on' : 'Shuffle: off'}
                className="btn btn-icon"
              >
                <Shuffle strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={handleCycleRepeat}
                aria-label={`Repeat mode: ${repeatMode}`}
                aria-pressed={repeatMode !== 'off'}
                title={`Repeat: ${repeatMode}`}
                className="btn btn-icon"
              >
                {repeatMode === 'one' ? <Repeat1 strokeWidth={2.5} /> : <Repeat strokeWidth={2.5} />}
              </button>
            </div>

            <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={() => setIsMuted(!isMuted)} aria-label={isMuted ? 'Unmute' : 'Mute'} className="btn btn-icon btn-ghost">
                {isMuted || volume === 0 ? <VolumeX strokeWidth={2.5} /> : <Volume2 strokeWidth={2.5} />}
              </button>
              <input
                type="range"
                name="volume"
                min="0"
                max="100"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  setVolume(Number(e.target.value));
                  if (isMuted) setIsMuted(false);
                }}
                className="slider slider-thin !w-20 sm:!w-24"
                aria-label="Volume control"
              />
              <button
                type="button"
                onClick={handleToggleVideo}
                disabled={!hasVideo}
                aria-label="Show video"
                aria-pressed={isVideoShown}
                title={isVideoShown ? 'Video: shown' : 'Video: hidden'}
                className="btn btn-sm ml-1"
              >
                {isVideoShown ? <Video className="w-4 h-4" strokeWidth={2.5} /> : <VideoOff className="w-4 h-4" strokeWidth={2.5} />}
                <span>Video</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPlaylist(!showPlaylist);
                  setShowSettings(false);
                }}
                aria-label="Toggle playlist and queue"
                aria-pressed={showPlaylist}
                title="Playlist & queue"
                className="btn btn-sm ml-1"
              >
                <ListMusic className="w-4 h-4" strokeWidth={2.5} />
                <span>Queue</span>
                <span className="font-data text-base">{queue.length}</span>
              </button>
            </div>
          </div>
        </>}

        {playbackError && (
          <p role="alert" className="mt-2 text-base font-bold">
            {playbackError}
          </p>
        )}
      </div>
    </section>
  );
}
