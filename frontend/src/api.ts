import type {
  TrailerResponse,
  RemixResponse,
  StoryResponse,
  NarrateResponse,
  GalleryResponse,
  Genre,
} from './types';

const API_URL = import.meta.env.VITE_API_URL as string;

if (!API_URL) {
  console.warn('VITE_API_URL is not set — API calls will fail.');
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export async function generateTrailer(dayText: string): Promise<TrailerResponse> {
  return post<TrailerResponse>('/bollywood-ify', { action: 'trailer', dayText });
}

export async function remixTrailer(dayText: string, genre: Genre): Promise<RemixResponse> {
  return post<RemixResponse>('/bollywood-ify', { action: 'remix', dayText, genre });
}

export async function generateStory(
  dayText: string,
  title: string,
  tagline: string,
): Promise<StoryResponse> {
  return post<StoryResponse>('/bollywood-ify', { action: 'story', dayText, title, tagline });
}

export async function narrateTrailer(
  title: string,
  tagline: string,
  script: string[],
  posterId: string,
): Promise<NarrateResponse> {
  return post<NarrateResponse>('/bollywood-ify', {
    action: 'narrate', title, tagline, script, posterId,
  });
}

export async function fetchGallery(): Promise<GalleryResponse> {
  const res = await fetch(`${API_URL}/gallery`, { method: 'GET' });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as GalleryResponse;
}
