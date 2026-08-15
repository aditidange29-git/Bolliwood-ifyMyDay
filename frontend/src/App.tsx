import { useState, useCallback } from 'react';
import { generateTrailer, generateStory } from './api';
import type { TrailerResponse, AppState } from './types';
import InputForm from './components/InputForm';
import LoadingScreen from './components/LoadingScreen';
import TrailerResult from './components/TrailerResult';
import StoryPanel from './components/StoryPanel';
import Gallery from './components/Gallery';

// Static titles for the marquee ticker — supplemented by real gallery data at runtime
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
  const [appState, setAppState]       = useState<AppState>('idle');
  const [dayText, setDayText]         = useState('');
  const [trailer, setTrailer]         = useState<TrailerResponse | null>(null);
  const [story, setStory]             = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [galleryTick, setGalleryTick] = useState(0);
  const [marqueeTitles, setMarqueeTitles] = useState<string[]>(SEED_TITLES);

  const handleGenerate = useCallback(async (text: string) => {
    setDayText(text);
    setTrailer(null);
    setStory(null);
    setError(null);
    setAppState('loading_trailer');

    try {
      const result = await generateTrailer(text);
      setTrailer(result);
      setAppState('trailer_ready');
      setGalleryTick(t => t + 1);
      // Add new title to marquee
      setMarqueeTitles(prev => [result.title, ...prev].slice(0, 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setAppState('idle');
    }
  }, []);

  const handleGenerateStory = useCallback(async () => {
    if (!trailer || !dayText) return;
    setStory(null);
    setAppState('loading_story');

    try {
      const result = await generateStory(dayText, trailer.title, trailer.tagline);
      setStory(result.story);
      setAppState('story_ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Story generation failed. Please try again.');
      setAppState('trailer_ready');
    }
  }, [trailer, dayText]);

  const isLoadingTrailer = appState === 'loading_trailer';
  const isLoadingStory   = appState === 'loading_story';
  const showTrailer      = trailer !== null && appState !== 'loading_trailer';
  const showStory        = story !== null;

  // Build marquee text — duplicate for seamless loop
  const marqueeContent = marqueeTitles.join('  ✦  ');
  const marqueeDouble  = `${marqueeContent}  ✦  ${marqueeContent}`;

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header" role="banner">
        <h1 className="header__title">🎬 Bollywood-ify My Day</h1>
        <p className="header__subtitle">Turn your ordinary day into a blockbuster</p>
        <p className="header__stars" aria-hidden="true">✦ ✦ ✦</p>
      </header>

      {/* ── Marquee ticker ── */}
      <div className="marquee-strip" aria-hidden="true">
        <div className="marquee-track">
          <span className="marquee-item">{marqueeDouble}</span>
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="main" id="main-content">

        {/* Input form — always visible unless loading trailer */}
        {!isLoadingTrailer && (
          <InputForm onSubmit={handleGenerate} isLoading={isLoadingTrailer || isLoadingStory} />
        )}

        {/* Error */}
        {error && (
          <div className="error-banner" role="alert">
            ⚠ {error}
          </div>
        )}

        {/* Loading state */}
        {isLoadingTrailer && <LoadingScreen />}

        {/* Trailer result */}
        {showTrailer && (
          <>
            <div className="divider" aria-hidden="true">
              <span className="divider__icon">✦</span>
            </div>
            <TrailerResult
              result={trailer}
              onGenerateStory={handleGenerateStory}
              isLoadingStory={isLoadingStory}
            />
          </>
        )}

        {/* Story loading */}
        {isLoadingStory && (
          <LoadingScreen message="Writing the dramatic screenplay…" />
        )}

        {/* Full story */}
        {showStory && (
          <>
            <div className="divider" aria-hidden="true">
              <span className="divider__icon">✦</span>
            </div>
            <StoryPanel story={story} />
          </>
        )}

        {/* Gallery */}
        <Gallery refreshTrigger={galleryTick} />

      </main>

      {/* ── Footer ── */}
      <footer className="footer" role="contentinfo">
        <p className="footer__text">
          Built with ✦ Nova Lite · Pollinations Flux · AWS Lambda · Amazon S3 · AWS Weekend Challenge
        </p>
      </footer>
    </div>
  );
}
