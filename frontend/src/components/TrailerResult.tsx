import { useState, useEffect } from 'react';
import type { TrailerResponse } from '../types';

interface Props {
  result: TrailerResponse;
  onGenerateStory: () => void;
  isLoadingStory: boolean;
}

export default function TrailerResult({ result, onGenerateStory, isLoadingStory }: Props) {
  const [curtainsOpen, setCurtainsOpen] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Open curtains once the poster image has loaded
  useEffect(() => {
    if (imgLoaded) {
      const timer = setTimeout(() => setCurtainsOpen(true), 200);
      return () => clearTimeout(timer);
    }
  }, [imgLoaded]);

  return (
    <section className="trailer-result" aria-label="Your Bollywood trailer">
      {/* ── Poster ── */}
      <div className="poster-wrapper">
        <img
          src={result.posterUrl}
          alt={`Movie poster for ${result.title}`}
          className="poster-img"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgLoaded(true)} // open curtains even on error
        />
        {/* Curtains sit on top and slide away */}
        <div className={`curtain-left${curtainsOpen ? ' open' : ''}`} aria-hidden="true">
          <span className="curtain-icon">✦</span>
        </div>
        <div className={`curtain-right${curtainsOpen ? ' open' : ''}`} aria-hidden="true">
          <span className="curtain-icon">✦</span>
        </div>
      </div>

      {/* ── Script ── */}
      <div className="script-panel">
        <h2 className="script-panel__title">{result.title}</h2>
        <p className="script-panel__tagline">"{result.tagline}"</p>

        <div className="script-lines" role="list">
          {result.script.map((line, i) => (
            <div key={i} className="script-line" role="listitem">
              {line}
            </div>
          ))}
        </div>

        <div className="story-btn-row">
          <button
            className="btn-secondary"
            onClick={onGenerateStory}
            disabled={isLoadingStory}
            aria-busy={isLoadingStory}
          >
            {isLoadingStory ? '✦ Writing the story…' : '📖 Generate Full Story'}
          </button>
        </div>
      </div>
    </section>
  );
}
