interface Props {
  message?: string;
}

const MESSAGES = [
  'Cue the dramatic music…',
  'Hiring the orchestra…',
  'Polishing the melodrama…',
  'Summoning Bollywood magic…',
  'Adjusting the spotlight…',
];

export default function LoadingScreen({ message }: Props) {
  const displayMessage = message ?? MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

  return (
    <div
      className="loading-screen"
      role="status"
      aria-label="Generating your Bollywood experience"
    >
      {/* Film reel spinning */}
      <span className="loading-reel" aria-hidden="true">🎞️</span>

      {/* Bouncing dots */}
      <div className="loading-dots" aria-hidden="true">
        <div className="loading-dot" />
        <div className="loading-dot" />
        <div className="loading-dot" />
      </div>

      {/* Gradient shimmer bar */}
      <div className="loading-bar" aria-hidden="true">
        <div className="loading-bar-fill" />
      </div>

      {/* Sparkle burst */}
      <div className="loading-sparkles" aria-hidden="true">
        <span>✨</span>
        <span>🌟</span>
        <span>💫</span>
        <span>🌟</span>
        <span>✨</span>
      </div>

      <p className="loading-text">{displayMessage}</p>
      <p className="loading-sub">
        Your poster takes ~30–40 s — the drama is worth the wait.
      </p>
    </div>
  );
}
