import { useState, useRef, useEffect, useCallback } from 'react';
import { narrateTrailer } from '../api';
import type { SpeechMark } from '../types';

interface Props {
  title: string;
  tagline: string;
  script: string[];
  posterUrl: string;
  /** uuid portion of posterUrl, used as cache key */
  posterId: string;
  /** Called with index of the script line currently being spoken (-1 = none) */
  onLineActive: (index: number) => void;
}

type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'done' | 'error';

export default function NarratorPlayer({
  title, tagline, script, posterId, onLineActive,
}: Props) {
  const [playerState, setPlayerState] = useState<PlayerState>('idle');
  const [errorMsg,    setErrorMsg]    = useState('');

  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const marksRef      = useRef<SpeechMark[]>([]);
  const rafRef        = useRef<number>(0);
  const activeLineRef = useRef<number>(-1);

  // Map sentence speech marks to script line indices.
  // Polly sentence marks contain the rendered sentence text; we match by index order.
  const sentenceMarks = useRef<{ time: number; lineIndex: number }[]>([]);

  const cancelRaf = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  // Tick: check audio currentTime against speech marks to highlight lines
  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    const nowMs = audio.currentTime * 1000;

    let activeIdx = -1;
    for (const sm of sentenceMarks.current) {
      if (nowMs >= sm.time) activeIdx = sm.lineIndex;
    }

    if (activeIdx !== activeLineRef.current) {
      activeLineRef.current = activeIdx;
      onLineActive(activeIdx);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [onLineActive]);

  async function handlePlay() {
    if (playerState === 'paused' && audioRef.current) {
      audioRef.current.play();
      setPlayerState('playing');
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    if (playerState === 'playing' && audioRef.current) {
      audioRef.current.pause();
      setPlayerState('paused');
      cancelRaf();
      return;
    }

    // Fresh play — fetch narration
    setPlayerState('loading');
    setErrorMsg('');
    onLineActive(-1);

    try {
      const data = await narrateTrailer(title, tagline, script, posterId);
      marksRef.current = data.speechMarks;

      // Build sentence → line index map
      const sentences = data.speechMarks.filter(m => m.type === 'sentence');
      sentenceMarks.current = sentences.map((sm, i) => ({
        time: sm.time,
        lineIndex: Math.min(i, script.length - 1),
      }));

      const audio = new Audio(data.audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setPlayerState('done');
        cancelRaf();
        onLineActive(-1);
      };

      audio.onerror = () => {
        setPlayerState('error');
        setErrorMsg('Audio playback failed.');
        cancelRaf();
        onLineActive(-1);
      };

      await audio.play();
      setPlayerState('playing');
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setPlayerState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Narration failed.');
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelRaf();
      audioRef.current?.pause();
      onLineActive(-1);
    };
  }, [onLineActive]);

  const isLoading = playerState === 'loading';
  const isPlaying = playerState === 'playing';
  const isDone    = playerState === 'done';

  return (
    <div className="narrator-player">
      <button
        className={`narrator-btn${isPlaying ? ' narrator-btn--playing' : ''}${isLoading ? ' narrator-btn--loading' : ''}`}
        onClick={handlePlay}
        disabled={isLoading}
        title={isPlaying ? 'Pause narration' : 'Play trailer narration'}
        aria-label={isPlaying ? 'Pause' : isLoading ? 'Loading narration…' : 'Play trailer narration'}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <span className="narrator-btn__spinner" aria-hidden="true" />
        ) : isPlaying ? (
          <span className="narrator-btn__icon" aria-hidden="true">⏸</span>
        ) : isDone ? (
          <span className="narrator-btn__icon" aria-hidden="true">↺</span>
        ) : (
          <span className="narrator-btn__icon" aria-hidden="true">▶</span>
        )}
      </button>
      {playerState === 'idle' && (
        <span className="narrator-hint">Play trailer voiceover</span>
      )}
      {isLoading && (
        <span className="narrator-hint">Generating narration…</span>
      )}
      {playerState === 'error' && (
        <span className="narrator-hint narrator-hint--error">{errorMsg}</span>
      )}
    </div>
  );
}
