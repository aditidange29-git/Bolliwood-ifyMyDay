import { useState, useEffect, useCallback } from 'react';
import type { TrailerResponse, Genre } from '../types';
import GenreRemix from './GenreRemix';
import ActionBar from './ActionBar';
import NarratorPlayer from './NarratorPlayer';

interface Props {
  result: TrailerResponse;
  onGenerateStory: () => void;
  isLoadingStory: boolean;
  isRemixing: boolean;
  activeGenre: Genre | null;
  onRemix: (genre: Genre) => void;
  onNew: () => void;
}

/** Extract uuid from a poster S3 URL like …/posters/{uuid}.jpg */
function extractPosterId(url: string): string {
  const match = url.match(/posters\/([^.]+)\./);
  return match ? match[1] : '';
}

export default function TrailerResult({
  result, onGenerateStory, isLoadingStory,
  isRemixing, activeGenre, onRemix, onNew,
}: Props) {
  const [curtainsOpen, setCurtainsOpen] = useState(false);
  const [imgLoaded,    setImgLoaded]    = useState(false);
  const [activeLine,   setActiveLine]   = useState(-1);

  const posterId = extractPosterId(result.posterUrl);

  // Reset curtains whenever the posterUrl changes (remix swaps image)
  useEffect(() => {
    setCurtainsOpen(false);
    setImgLoaded(false);
    setActiveLine(-1);
  }, [result.posterUrl]);

  useEffect(() => {
    if (imgLoaded) {
      const t = setTimeout(() => setCurtainsOpen(true), 200);
      return () => clearTimeout(t);
    }
  }, [imgLoaded]);

  const handleLineActive = useCallback((idx: number) => setActiveLine(idx), []);

  return (
    <section aria-label="Your Bollywood trailer">

      {/* ── Poster + Script grid ── */}
      <div className="trailer-result">

        {/* Poster column */}
        <div className="poster-col">
          <div className="poster-wrapper">
            <img
              src={result.posterUrl}
              alt={`Movie poster for ${result.title}`}
              className="poster-img"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgLoaded(true)}
            />
            <div className={`curtain-left${curtainsOpen ? ' open' : ''}`} aria-hidden="true">
              <span className="curtain-icon">🎞️</span>
            </div>
            <div className={`curtain-right${curtainsOpen ? ' open' : ''}`} aria-hidden="true">
              <span className="curtain-icon">🎬</span>
            </div>
          </div>

          {/* Play button below poster */}
          <NarratorPlayer
            title={result.title}
            tagline={result.tagline}
            script={result.script}
            posterId={posterId}
            onLineActive={handleLineActive}
          />
        </div>

        {/* Script column */}
        <div className="script-panel">
          <h2 className="script-panel__title">{result.title}</h2>
          <p className="script-panel__tagline">"{result.tagline}"</p>

          <div className="script-lines" role="list">
            {result.script.map((line, i) => (
              <div
                key={i}
                className={`script-line${activeLine === i ? ' script-line--active' : ''}`}
                role="listitem"
              >
                🎙️ {line}
              </div>
            ))}
          </div>

          <div className="story-btn-row">
            <button
              className="btn-secondary"
              onClick={onGenerateStory}
              disabled={isLoadingStory || isRemixing}
              aria-busy={isLoadingStory}
            >
              {isLoadingStory ? '⏳ Writing the story…' : '📖 Generate Full Story'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Action bar ── */}
      <ActionBar result={result} onNew={onNew} />

      {/* ── Genre remix ── */}
      <GenreRemix
        activeGenre={activeGenre}
        isLoading={isRemixing}
        onRemix={onRemix}
      />

    </section>
  );
}
