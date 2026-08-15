export interface TrailerResponse {
  title: string;
  tagline: string;
  script: string[];
  posterUrl: string;
}

export interface RemixResponse extends TrailerResponse {
  genre: string;
}

export interface StoryResponse {
  story: string;
}

export interface NarrateResponse {
  audioUrl: string;
  speechMarks: SpeechMark[];
  cached: boolean;
}

export interface SpeechMark {
  time: number;   // ms offset from audio start
  type: 'word' | 'sentence';
  start: number;  // char offset in input text
  end: number;
  value: string;  // the word/sentence text
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

export type Genre = 'horror' | 'romance' | 'comedy' | 'action' | 'thriller';

export type AppState =
  | 'idle'
  | 'loading_trailer'
  | 'trailer_ready'
  | 'loading_remix'
  | 'loading_story'
  | 'story_ready';
