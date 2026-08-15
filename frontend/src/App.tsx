import { useState, useCallback } from 'react';
import { generateTrailer, remixTrailer, generateStory } from './api';
import type { TrailerResponse, AppState, Genre } from './types';
import InputForm from './components/InputForm';
import LoadingScreen from './components/LoadingScreen';
import TrailerResult from './components/TrailerResult';
import StoryPanel from './components/StoryPanel';

const SEED_TITLES = [
  'THE COFFEE OF DESTINY',
  'MONSOON OF THE HEART',
  'LOVE IN THE TIME OF DEADLINES',
  'TRIUMPH OVER TRIALS',
  'THE LAST MEETING',
  'FIRE AND PROMOTION',
  'TEARS OF THE TRAFFIC',
  'A MONDAY TO REMEMBER',
];

export default function App() {
  const [appState, setAppState]           = useState<AppState>('idle');
  const [dayText,  setDayText]            = useState('');
  const [trailer,  setTrailer]            = useState<TrailerResponse | null>(null);
  const [story,    setStory]              = useState<string | null>(null);
  const [error,    setError]              = useState<string | null>(null);
  const [isRemixing, setIsRemixing]       = useState(false);
  const [activeGenre, setActiveGenre]     = useState<Genre | null>(null);
  const [marqueeTitles, setMarqueeTitles] = useState<string[]>(SEED_TITLES);

  // ── Generate first trailer ──────────────────────────────────────────────────
  const handleGenerate = useCallback(async (text: string) => {
    setDayText(text);
    setTrailer(null);
    setStory(null);
    setError(null);
    setActiveGenre(null);
    setAppState('loading_trailer');

    try {
      const result = await generateTrailer(text);
      setTrailer(result);
      setAppState('trailer_ready');
      setMarqueeTitles(prev => [result.title, ...prev].slice(0, 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setAppState('idle');
    }
  }, []);

  // ── Genre remix ─────────────────────────────────────────────────────────────
  const handleRemix = useCallback(async (genre: Genre) => {
    if (!dayText) return;
    setIsRemixing(true);
    setActiveGenre(genre);
    setStory(null);
    setError(null);

    try {
      const result = await remixTrailer(dayText, genre);
      setTrailer(result);
      setMarqueeTitles(prev => [result.title, ...prev].slice(0, 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remix failed. Please try again.');
    } finally {
      setIsRemixing(false);
    }
  }, [dayText]);

  // ── Full story ───────────────────────────────────────────────────────────────
  const handleGenerateStory = useCallback(async () => {
    if (!trailer || !dayText) return;
    setStory(null);
    setAppState('loading_story');

    try {
      const result = await generateStory(dayText, trailer.title, trailer.tagline);
      setStory(result.story);
      setAppState('story_ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Story generation failed.');
      setAppState('trailer_ready');
    }
  }, [trailer, dayText]);

  // ── Reset to input ───────────────────────────────────────────────────────────
  const handleNew = useCallback(() => {
    setTrailer(null);
    setStory(null);
    setError(null);
    setActiveGenre(null);
    setDayText('');
    setIsRemixing(false);
    setAppState('idle');
  }, []);

  const isLoadingTrailer = appState === 'loading_trailer';
  const isLoadingStory   = appState === 'loading_story';
  const showTrailer      = trailer !== null && !isLoadingTrailer;
  const showStory        = story !== null;

  const marqueeContent = marqueeTitles.join('  ✦  ');
  const marqueeDouble  = `${marqueeContent}  ✦  ${marqueeContent}`;

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header" role="banner">
        <span className="header__icon" aria-hidden="true">🎬</span>
        <h1 className="header__title">Bollywood-ify My Day</h1>
        <p className="header__subtitle">Turn your ordinary day into a blockbuster ✨</p>
        <div className="header__pills" aria-hidden="true">
          <span className="header__pill">🎞️ AI-Powered</span>
          <span className="header__pill">🎭 Drama Generator</span>
          <span className="header__pill">🌟 Instant Poster</span>
        </div>
      </header>

      {/* ── Marquee ── */}
      <div className="marquee-strip" aria-hidden="true">
        <div className="marquee-track">
          <span className="marquee-item">{marqueeDouble}</span>
        </div>
      </div>

      {/* ── Main ── */}
      <main className="main" id="main-content">

        {/* Input */}
        {!isLoadingTrailer && !showTrailer && (
          <div className="input-card">
            <div className="input-card__header">
              <span className="input-card__icon" aria-hidden="true">🎥</span>
              <h2 className="input-card__title">Describe Your Day</h2>
            </div>
            <InputForm
              onSubmit={handleGenerate}
              isLoading={isLoadingTrailer || isLoadingStory || isRemixing}
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="error-banner" role="alert">⚠ {error}</div>
        )}

        {/* Loading */}
        {isLoadingTrailer && <LoadingScreen />}

        {/* Trailer result + action bar + genre remix */}
        {showTrailer && (
          <>
            <div className="divider" aria-hidden="true">
              <span className="divider__icon">🎞️</span>
            </div>
            {isRemixing && <LoadingScreen message="Remixing the drama…" />}
            {!isRemixing && (
              <TrailerResult
                result={trailer}
                onGenerateStory={handleGenerateStory}
                isLoadingStory={isLoadingStory}
                isRemixing={isRemixing}
                activeGenre={activeGenre}
                onRemix={handleRemix}
                onNew={handleNew}
              />
            )}
          </>
        )}

        {/* Story loading */}
        {isLoadingStory && <LoadingScreen message="Writing the dramatic screenplay…" />}

        {/* Full story — shown below trailer, no action bar */}
        {showStory && !isLoadingStory && (
          <>
            <div className="divider" aria-hidden="true">
              <span className="divider__icon">📜</span>
            </div>
            <StoryPanel story={story} />
          </>
        )}

      </main>

      {/* ── Footer ── */}
      <footer className="footer" role="contentinfo">
        <p className="footer__text">
          Built for AWS Weekend Challenge · Nova Lite · Polly · Pollinations Flux · Lambda · S3
        </p>
        <div className="footer__icons" aria-hidden="true">🎬 🎞️ 🎭 🎟️ 🎦</div>
      </footer>
    </div>
  );
}
