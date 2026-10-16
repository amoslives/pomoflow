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
  Settings,
  ListMusic,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Radio,
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

export function AudioPlayer() {
  const [showSettings, setShowSettings] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [inputTitle, setInputTitle] = useState('');
  const [queue, setQueue] = useState<TrackItem[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pomodoro_music_queue');
      if (saved) return normalizeQueue(parseStoredJson(saved));
    }
    return [];
  });

  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [liveTitle, setLiveTitle] = useState<string>('');
  const [playedIndices, setPlayedIndices] = useState<number[]>([]);
  const [apiReady, setApiReady] = useState(false);
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(null);
  const [nativePlaylistTracks, setNativePlaylistTracks] = useState<NativePlaylistTrack[]>([]);
  const [nativePlaylistIndex, setNativePlaylistIndex] = useState(-1);
  const [isPlaylistMetadataLoading, setIsPlaylistMetadataLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreview, setSeekPreview] = useState(0);

  const ytPlayerRef = useRef<any>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const pendingTrackRef = useRef<TrackItem | null>(null);
  const handleNextTrackRef = useRef<() => void>(() => {});
  const resumePositionRef = useRef(0);
  const queueRef = useRef(queue);
  const currentTrackIndexRef = useRef(currentTrackIndex);
  const repeatModeRef = useRef(repeatMode);
  const failedTrackIdsRef = useRef<Set<string>>(new Set());
  const playTrackAtIndexRef = useRef<(index: number) => void>(() => {});
  const playlistMetadataCacheRef = useRef<Map<string, YouTubeVideoMetadata | null>>(new Map());
  const playlistSyncGenerationRef = useRef(0);

  const currentTrack: TrackItem | undefined = queue[currentTrackIndex];

  useEffect(() => {
    queueRef.current = queue;
    currentTrackIndexRef.current = currentTrackIndex;
    repeatModeRef.current = repeatMode;
  }, [queue, currentTrackIndex, repeatMode]);

  // Save queue
  useEffect(() => {
    localStorage.setItem('pomodoro_music_queue', JSON.stringify(queue));
  }, [queue]);

  // Load YouTube Iframe API once
  useEffect(() => {
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
      .filter((i) => !playedIndices.includes(i) && i !== currentTrackIndex);

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

    setPlayedIndices((prev) => [...prev, nextIndex]);
    setPlaybackError('');
    playTrackAtIndex(nextIndex);
  }, [queue, currentTrackIndex, isShuffle, repeatMode, playedIndices, currentTrack]);

  useEffect(() => {
    handleNextTrackRef.current = handleNextTrack;
  }, [handleNextTrack]);

  // Play previous track
  const handlePrevTrack = useCallback(() => {
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
  const playTrackAtIndex = (index: number, queueOverride?: TrackItem[]) => {
    const effectiveQueue = queueOverride ?? queue;
    if (index < 0 || index >= effectiveQueue.length) return;
    setCurrentTrackIndex(index);
    const track = effectiveQueue[index];
    if (!track) return;
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

    loadYouTubeSource(track);
  };

  const loadYouTubeSource = (track: TrackItem) => {
    if (!window.YT || !window.YT.Player) {
      pendingTrackRef.current = track;
      return;
    }
    pendingTrackRef.current = null;

    const onPlayerReady = (event: any) => {
      ytPlayerRef.current = event.target;
      event.target.setVolume(isMuted ? 0 : volume);
      if (isShuffle && typeof event.target.setShuffle === 'function') {
        event.target.setShuffle(true);
      }
      if (repeatMode === 'all' && typeof event.target.setLoop === 'function') {
        event.target.setLoop(true);
      }
      event.target.playVideo();
      setIsPlaying(true);
      if (track.sourceType === 'youtube-playlist') {
        syncNativePlaylist(event.target);
      }
    };

    const onPlayerStateChange = (event: any) => {
      // 1 = playing, 2 = paused, 0 = ended
      if (event.data === 1) {
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
      } else if (event.data === 0) {
        // Track ended
        handleNextTrackRef.current();
      }
    };

    const onError = (event: any) => {
      if (track.sourceType === 'youtube-playlist') {
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
        if (track.sourceType === 'youtube-playlist' && track.playlistId) {
          ytPlayerRef.current.loadPlaylist({
            list: track.playlistId,
            listType: 'playlist',
            index: 0,
          });
        } else if (track.youtubeId) {
          ytPlayerRef.current.loadVideoById(track.youtubeId);
        }
        ytPlayerRef.current.playVideo();
        setIsPlaying(true);
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
      height: '1',
      width: '1',
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
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
    } else if (track.youtubeId) {
      playerConfig.videoId = track.youtubeId;
    }

    try {
      ytPlayerRef.current = new window.YT.Player('youtube-player-element', playerConfig);
    } catch {}
  };

  useEffect(() => {
    playTrackAtIndexRef.current = playTrackAtIndex;
  });

  useEffect(() => {
    if (apiReady && pendingTrackRef.current) {
      loadYouTubeSource(pendingTrackRef.current);
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
        playTrackAtIndex(currentTrackIndex);
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

  // Cycle Repeat Mode: off -> all -> one
  const handleCycleRepeat = () => {
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
    setQueue((prev) => prev.filter((t) => t.id !== id));
    if (index === currentTrackIndex) {
      handleStop();
      playlistSyncGenerationRef.current += 1;
      setNativePlaylistTracks([]);
      setNativePlaylistIndex(-1);
    } else if (index < currentTrackIndex) {
      setCurrentTrackIndex((prev) => Math.max(0, prev - 1));
    }
    if (expandedPlaylistId === id) setExpandedPlaylistId(null);
  };

  const handlePlayNativePlaylistTrack = (index: number) => {
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

  return (
    <div className="w-full mt-5 font-pixel select-none">
      {/* Hidden YouTube API container */}
      <div className="absolute -top-[9999px] -left-[9999px] pointer-events-none opacity-0">
        <div id="youtube-player-element" />
      </div>

      {/* Settings & Add Track / Playlist Panel */}
      {showSettings && (
        <div className="w-full mb-3 p-3 bg-neutral-200 dark:bg-neutral-800 border-2 border-neutral-400 dark:border-neutral-700 shadow-[3px_3px_0px_rgba(0,0,0,0.2)]">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-neutral-300 dark:border-neutral-700">
            <h3 className="text-xl sm:text-2xl font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <Radio className="w-5 h-5" />
              <span>Load YouTube Song or Playlist</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 text-lg uppercase cursor-pointer"
            >
              Close
            </button>
          </div>

          <form onSubmit={handleAddSource} className="space-y-2 mb-3">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste YouTube song URL, video ID, or playlist URL (e.g. youtube.com/playlist?list=...)"
              className="w-full px-3 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-500 text-neutral-900 dark:text-neutral-100 text-lg placeholder:text-neutral-400 focus:outline-none"
            />
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={inputTitle}
                onChange={(e) => setInputTitle(e.target.value)}
                placeholder="Custom Label / Title (Optional)"
                className="flex-1 px-3 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-500 text-neutral-900 dark:text-neutral-100 text-lg placeholder:text-neutral-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!urlInput.trim()}
                className="px-5 py-1.5 bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 uppercase text-lg border border-neutral-800 dark:border-neutral-200 cursor-pointer disabled:opacity-40 hover:bg-neutral-700 dark:hover:bg-neutral-300 transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Load & Play</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Playlist / Queue Drawer */}
      {showPlaylist && (
        <div className="w-full mb-3 p-3 bg-neutral-200 dark:bg-neutral-800 border-2 border-neutral-400 dark:border-neutral-700 shadow-[3px_3px_0px_rgba(0,0,0,0.2)]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-300 dark:border-neutral-700">
            <h3 className="text-xl sm:text-2xl font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <ListMusic className="w-5 h-5" />
              <span>Current Playlist & Queue ({queue.length})</span>
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPlaylist(false)}
                className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 text-lg uppercase cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
            {queue.map((track, idx) => {
              const isPlaylist = track.sourceType === 'youtube-playlist';
              const isExpanded = isPlaylist && expandedPlaylistId === track.id;
              const isCurrent = idx === currentTrackIndex;

              return (
                <div
                  key={track.id}
                  className={`group text-sm sm:text-base border transition-colors ${
                    isCurrent
                      ? 'bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900 border-neutral-900 dark:border-neutral-100 font-bold'
                      : 'bg-white/70 dark:bg-neutral-900/70 text-neutral-800 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700 hover:border-neutral-500'
                  }`}
                >
                  <div className="flex items-center justify-between p-2">
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
                      className="min-w-0 flex-1 flex items-center gap-2 text-left cursor-pointer"
                    >
                      <span className="w-5 flex-shrink-0 text-center font-mono-tech text-xs opacity-70">
                        {isPlaylist
                          ? (isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)
                          : (isCurrent && isPlaying ? '▶' : `${idx + 1}.`)}
                      </span>
                      <span className="truncate">{track.title}</span>
                      {isPlaylist && (
                        <span className="px-1 text-[10px] uppercase border border-current opacity-80 flex-shrink-0">
                          Playlist
                        </span>
                      )}
                    </button>

                    <div className="flex items-center gap-1 ml-2">
                      {isPlaylist && (
                        <button
                          type="button"
                          onClick={() => playTrackAtIndex(idx)}
                          aria-label={`Play ${track.title}`}
                          title="Play playlist from the beginning"
                          className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleRemoveTrack(track.id, idx, e)}
                        aria-label={`Remove ${track.title}`}
                        className="p-1 opacity-70 hover:opacity-100 hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-current/25 bg-white/10 dark:bg-black/10 p-1.5">
                      {!isCurrent ? (
                        <p className="p-2 text-xs font-mono-tech font-normal opacity-75">
                          Play this playlist to load its songs.
                        </p>
                      ) : nativePlaylistTracks.length === 0 ? (
                        <p className="p-2 text-xs font-mono-tech font-normal opacity-75">
                          Loading playlist songs...
                        </p>
                      ) : (
                        <>
                          <div className="space-y-1 font-normal">
                            {nativePlaylistTracks.map((playlistTrack, playlistIndex) => (
                              <button
                                key={`${playlistTrack.videoId}-${playlistIndex}`}
                                type="button"
                                onClick={() => handlePlayNativePlaylistTrack(playlistIndex)}
                                aria-label={`Play playlist track ${playlistIndex + 1}: ${playlistTrack.title}`}
                                className={`w-full flex items-center gap-2 p-1.5 text-left border cursor-pointer transition-colors ${
                                  playlistIndex === nativePlaylistIndex
                                    ? 'border-orange-500 bg-orange-500/15'
                                    : 'border-transparent hover:border-current/40 hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                              >
                                <span className="w-6 flex-shrink-0 text-center font-mono-tech text-xs opacity-70">
                                  {playlistIndex === nativePlaylistIndex && isPlaying ? '▶' : playlistIndex + 1}
                                </span>
                                <img
                                  src={playlistTrack.thumbnailUrl}
                                  alt=""
                                  loading="lazy"
                                  className="w-12 h-7 object-cover flex-shrink-0 bg-neutral-300 dark:bg-neutral-700"
                                />
                                <span className="min-w-0">
                                  <span className="block truncate">{playlistTrack.title}</span>
                                  <span className="block truncate text-xs font-mono-tech opacity-60">{playlistTrack.author}</span>
                                </span>
                              </button>
                            ))}
                          </div>

                          {nativePlaylistTracks.some((trackItem) => !trackItem.metadataLoaded) && (
                            <button
                              type="button"
                              onClick={() => void hydrateNativePlaylistMetadata(nativePlaylistTracks.map((trackItem) => trackItem.videoId))}
                              disabled={isPlaylistMetadataLoading}
                              className="w-full mt-1.5 p-1.5 text-xs uppercase font-mono-tech border border-current/40 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 cursor-pointer"
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
        </div>
      )}

      {/* Docked Retro Player Bar */}
      <div className="w-full flex flex-wrap items-center gap-2 p-2.5 border-2 border-neutral-400 dark:border-neutral-700 bg-neutral-200/90 dark:bg-neutral-800/90 backdrop-blur-sm text-neutral-800 dark:text-neutral-200 shadow-[3px_3px_0px_rgba(0,0,0,0.2)]">
        {/* Track Title Display */}
        <div className="order-[1] flex-1 min-w-40 overflow-hidden px-2.5 py-1 bg-white dark:bg-neutral-900 border border-neutral-400 dark:border-neutral-600 text-sm sm:text-base flex items-center h-8">
          <div className="w-full truncate font-mono-tech text-neutral-800 dark:text-neutral-200">
            {displayTitle}
          </div>
        </div>

        {/* Current Time */}
        <div className="order-[5] px-1.5 font-mono-tech text-sm min-w-[45px] text-center">
          {isLive ? 'LIVE' : formatTime(displayedTime)}
        </div>

        {/* Transport Controls */}
        <div className="order-[2] flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrevTrack}
            aria-label="Previous track"
            title="Previous track"
            className="p-1.5 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors border border-transparent hover:border-neutral-400 dark:hover:border-neutral-600 cursor-pointer active:translate-y-0.5"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleTogglePlayPause}
            aria-label={isPlaying ? 'Pause music' : 'Play music'}
            title={isPlaying ? 'Pause' : 'Play'}
            className="p-1.5 bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-300 transition-colors cursor-pointer active:translate-y-0.5"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
          </button>

          <button
            type="button"
            onClick={handleStop}
            aria-label="Stop playback"
            title="Stop playback"
            className="p-1.5 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors border border-transparent hover:border-neutral-400 dark:hover:border-neutral-600 cursor-pointer active:translate-y-0.5"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>

          <button
            type="button"
            onClick={handleNextTrack}
            aria-label="Next track"
            title="Next track"
            className="p-1.5 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors border border-transparent hover:border-neutral-400 dark:hover:border-neutral-600 cursor-pointer active:translate-y-0.5"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Shuffle & Repeat Controls */}
        <div className="order-[3] flex items-center gap-1 border-x border-neutral-300 dark:border-neutral-700 px-1">
          {/* Shuffle Mode Button */}
          <button
            type="button"
            onClick={handleToggleShuffle}
            aria-label={isShuffle ? 'Disable shuffle mode' : 'Enable shuffle mode'}
            title={isShuffle ? 'Shuffle: ON' : 'Shuffle: OFF'}
            className={`p-1.5 border transition-all cursor-pointer active:translate-y-0.5 ${
              isShuffle
                ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 border-neutral-800 dark:border-neutral-200'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:border-neutral-400'
            }`}
          >
            <Shuffle className="w-4 h-4" />
          </button>

          {/* Repeat Mode Button */}
          <button
            type="button"
            onClick={handleCycleRepeat}
            aria-label={`Repeat mode: ${repeatMode}`}
            title={`Repeat: ${repeatMode}`}
            className={`p-1.5 border transition-all cursor-pointer active:translate-y-0.5 ${
              repeatMode !== 'off'
                ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 border-neutral-800 dark:border-neutral-200'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:border-neutral-400'
            }`}
          >
            {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </button>
        </div>

        <div className="order-[4] basis-full h-0" aria-hidden="true" />

        {/* Seek Progress Slider */}
        <div className="order-[6] flex-1 min-w-40 flex items-center px-1">
          <input
            type="range"
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
            className="retro-progress-slider w-full disabled:opacity-40"
            style={{ '--seek-progress': `${seekPercent}%` } as React.CSSProperties}
            aria-label={isLive ? 'Live stream progress is not seekable' : 'Seek through current track'}
            aria-valuetext={isLive ? 'Live' : `${formatTime(displayedTime)} of ${formatTime(duration)}`}
          />
        </div>

        {/* Total Time */}
        <div className="order-[7] px-1 font-mono-tech text-sm min-w-[45px] text-center">
          {isLive ? 'LIVE' : formatTime(duration)}
        </div>

        <div className="order-[8] basis-full h-0" aria-hidden="true" />

        {/* Volume controls */}
        <div className="order-[9] ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
            className="p-1 hover:bg-neutral-300 dark:hover:bg-neutral-700 cursor-pointer"
          >
            {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              if (isMuted) setIsMuted(false);
            }}
            className="retro-volume-slider w-16 sm:w-20"
            aria-label="Volume control"
          />
        </div>

        {/* Playlist & Settings Drawers */}
        <div className="order-[10] flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setShowPlaylist(!showPlaylist);
              setShowSettings(false);
            }}
            aria-label="Toggle playlist and queue"
            title="Playlist & Queue"
            className={`p-1.5 border transition-colors cursor-pointer active:translate-y-0.5 ${
              showPlaylist
                ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 border-neutral-800 dark:border-neutral-200'
                : 'border-transparent hover:border-neutral-400 dark:hover:border-neutral-600 hover:bg-neutral-300 dark:hover:bg-neutral-700'
            }`}
          >
            <ListMusic className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setShowSettings(!showSettings);
              setShowPlaylist(false);
            }}
            aria-label="Audio settings and YouTube URL loader"
            title="Load YouTube URL or Playlist"
            className={`p-1.5 border transition-colors cursor-pointer active:translate-y-0.5 ${
              showSettings
                ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 border-neutral-800 dark:border-neutral-200'
                : 'border-transparent hover:border-neutral-400 dark:hover:border-neutral-600 hover:bg-neutral-300 dark:hover:bg-neutral-700'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

      </div>
      {playbackError && (
        <p role="alert" className="mt-2 text-sm font-mono-tech text-red-600 dark:text-red-400">
          {playbackError}
        </p>
      )}
    </div>
  );
}
