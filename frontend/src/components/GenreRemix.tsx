import type { Genre } from '../types';

interface Props {
  activeGenre: Genre | null;
  isLoading: boolean;
  onRemix: (genre: Genre) => void;
}

const GENRES: { id: Genre; label: string; emoji: string }[] = [
  { id: 'horror',   label: 'Horror',   emoji: '👻' },
  { id: 'romance',  label: 'Romance',  emoji: '💕' },
  { id: 'comedy',   label: 'Comedy',   emoji: '😂' },
  { id: 'action',   label: 'Action',   emoji: '💥' },
  { id: 'thriller', label: 'Thriller', emoji: '🔪' },
];

export default function GenreRemix({ activeGenre, isLoading, onRemix }: Props) {
  return (
    <div className="genre-remix" aria-label="Remix in a different genre">
      <p className="genre-remix__label">🎭 Remix in a different genre</p>
      <div className="genre-remix__pills">
        {GENRES.map(g => (
          <button
            key={g.id}
            className={`genre-pill${activeGenre === g.id ? ' genre-pill--active' : ''}`}
            onClick={() => onRemix(g.id)}
            disabled={isLoading}
            aria-pressed={activeGenre === g.id}
            aria-busy={isLoading && activeGenre === g.id}
          >
            <span className="genre-pill__emoji">{g.emoji}</span>
            <span>{isLoading && activeGenre === g.id ? 'Remixing…' : g.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
