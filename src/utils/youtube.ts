/**
 * YouTube and Audio Playlist pure logic & parser utilities
 */

export interface YouTubeSource {
  type: 'video' | 'playlist';
  id: string;
}

export interface YouTubeVideoMetadata {
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
}

/**
 * Fetches public metadata for one YouTube video without requiring an API key.
 */
export async function fetchYouTubeVideoMetadata(
  videoId: string,
  fetcher: (url: string) => Promise<Response> = fetch
): Promise<YouTubeVideoMetadata | null> {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;

  try {
    const videoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const response = await fetcher(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`
    );
    if (!response.ok) return null;

    const data = await response.json();
    if (!data || typeof data.title !== 'string') return null;

    return {
      videoId,
      title: data.title,
      author: typeof data.author_name === 'string' ? data.author_name : 'YouTube',
      thumbnailUrl: typeof data.thumbnail_url === 'string'
        ? data.thumbnail_url
        : `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    };
  } catch {
    return null;
  }
}

/**
 * Parses a YouTube URL or ID into a typed YouTubeSource (video or playlist)
 */
export function parseYouTubeSource(input: string): YouTubeSource | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // Check for playlist parameter `list=`
  const playlistMatch = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (playlistMatch && playlistMatch[1]) {
    const listId = playlistMatch[1];
    // If it's a playlist URL or user specifically loaded a playlist
    if (trimmed.includes('playlist') || !trimmed.includes('watch') || !trimmed.match(/[?&]v=/)) {
      return { type: 'playlist', id: listId };
    }
  }

  // If user entered raw playlist ID (typically starts with PL, RD, UU, etc.)
  if (/^(?:PL|RD|UU|OLAK5uy_)[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return { type: 'playlist', id: trimmed };
  }

  // Check for video URL
  const videoRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|live|watch)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const videoMatch = trimmed.match(videoRegex);
  if (videoMatch && videoMatch[1]) {
    return { type: 'video', id: videoMatch[1] };
  }

  // Raw 11-char video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed) && !trimmed.includes('/') && !trimmed.includes(' ') && !trimmed.startsWith('invalid-')) {
    return { type: 'video', id: trimmed };
  }

  // If there was a playlist match even with watch, return playlist if requested
  if (playlistMatch && playlistMatch[1]) {
    return { type: 'playlist', id: playlistMatch[1] };
  }

  return null;
}

export type RepeatMode = 'off' | 'all' | 'one';

/**
 * Calculates the next track index in a playlist or queue
 */
export function getNextTrackIndex(
  currentIndex: number,
  totalTracks: number,
  isShuffle: boolean,
  repeatMode: RepeatMode,
  unplayedIndices: number[] = []
): number {
  if (totalTracks <= 1) return 0;

  if (repeatMode === 'one') {
    return currentIndex;
  }

  if (isShuffle) {
    // If there are unplayed indices available
    const available = unplayedIndices.filter((idx) => idx !== currentIndex && idx >= 0 && idx < totalTracks);
    if (available.length > 0) {
      const randomIndex = Math.floor(Math.random() * available.length);
      return available[randomIndex];
    }
    // All played: if repeat mode is 'all', pick random different track
    if (repeatMode === 'all') {
      const others = Array.from({ length: totalTracks }, (_, i) => i).filter((i) => i !== currentIndex);
      return others[Math.floor(Math.random() * others.length)];
    }
    // No repeat and all played: cycle to 0 or stop
    return (currentIndex + 1) % totalTracks;
  }

  // Normal sequential
  const next = currentIndex + 1;
  if (next >= totalTracks) {
    return repeatMode === 'all' ? 0 : currentIndex;
  }
  return next;
}

/**
 * Calculates the previous track index in a playlist
 */
export function getPrevTrackIndex(
  currentIndex: number,
  totalTracks: number,
  repeatMode: RepeatMode
): number {
  if (totalTracks <= 1) return 0;

  if (repeatMode === 'one') {
    return currentIndex;
  }

  const prev = currentIndex - 1;
  if (prev < 0) {
    return repeatMode === 'all' ? totalTracks - 1 : 0;
  }
  return prev;
}

/**
 * Shuffles an array immutably using Fisher-Yates
 */
export function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
