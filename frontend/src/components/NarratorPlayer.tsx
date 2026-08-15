import { useState, useRef, useEffect, useCallback } from 'react';
import { narrateTrailer } from '../api';

interface Props {
  title: string;
  tagline: string;
  script: string[];
  /** uuid portion of posterUrl, used as S3 cache key */
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
  const rafRef        = useRef<number>(0);
  const activeLineRef = useRef<number>(-1);
  const sentenceMarks = useRef<{ time: number; lineIndex: number }[]>([]);

  const cancelRaf = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const stopAudio = useCallback(() => {
    cancelRaf();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended  = null;
      audioRef.current.onerror  = null;
      audioRef.current = null;
    }
    activeLineRef.current = -1;
    onLineActive(-1);
  }, [cancelRaf, onLineActive]);

  // Reset player when the posterId changes (new trailer or remix)
  useEffect(() => {
    stopAudio();
    setPlayerState('idle');
    setErrorMsg('');
    sentenceMarks.current = [];
  }, [posterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAudio();
  }, [stopAudio]);

  // RAF tick: sync audio position to script line highlights
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
    // Toggle pause/resume
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
    // Replay from done
    if (playerState === 'done' && audioRef.current) {
      audioRef.current.currentTime = 0;
      activeLineRef.current = -1;
      onLineActive(-1);
      audioRef.current.play();
      setPlayerState('playing');
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    // Fresh fetch + play
    setPlayerState('loading');
    setErrorMsg('');
    onLineActive(-1);

    try {
      const data = await narrateTrailer(title, tagline, script, posterId);

      // Map sentence marks → script line indices
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

  const isLoading = playerState === 'loading';
  const isPlaying = playerState === 'playing';
  const isDone    = playerState === 'done';

  return (
    <div className="narrator-player">
      <button
        className={[
          'narrator-btn',
          isPlaying ? 'narrator-btn--playing' : '',
          isLoading ? 'narrator-btn--loading' : '',
        ].filter(Boolean).join(' ')}
        onClick={handlePlay}
        disabled={isLoading}
        title={isPlaying ? 'Pause narration' : isDone ? 'Replay narration' : 'Play trailer narration'}
        aria-label={isPlaying ? 'Pause' : isLoading ? 'Loading narration…' : isDone ? 'Replay' : 'Play trailer narration'}
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
      {playerState === 'paused' && (
        <span className="narrator-hint">Paused</span>
      )}
      {playerState === 'error' && (
        <span className="narrator-hint narrator-hint--error">{errorMsg}</span>
      )}
    </div>
  );
}
