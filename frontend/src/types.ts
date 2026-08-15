export interface TrailerResponse {
  title: string;
  tagline: string;
  script: string[];
  posterUrl: string;
}

export interface StoryResponse {
  story: string;
}

export interface GalleryEntry {
  id: string;
  title: string;
  tagline: string;
  posterUrl: string;
  timestamp: string;
  dayText?: string;
}

export interface GalleryResponse {
  entries: GalleryEntry[];
}

export type AppState =
  | 'idle'
  | 'loading_trailer'
  | 'trailer_ready'
  | 'loading_story'
  | 'story_ready';
