interface Props {
  message?: string;
}

const MESSAGES = [
  'Consulting the stars…',
  'Hiring the orchestra…',
  'Dramatic pause loading…',
  'Polishing the dramatics…',
  'Summoning Bollywood magic…',
];

export default function LoadingScreen({ message }: Props) {
  const displayMessage = message ?? MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

  return (
    <div className="loading-screen" role="status" aria-label="Generating your Bollywood experience">
      <div className="loading-screen__clapboard" aria-hidden="true">🎬</div>
      <div className="loading-screen__bar" aria-hidden="true">
        <div className="loading-screen__bar-fill" />
      </div>
      <p className="loading-screen__text">{displayMessage}</p>
      <p className="loading-screen__sub">
        Generating your poster takes ~30–40 seconds — the drama is worth the wait.
      </p>
    </div>
  );
}
