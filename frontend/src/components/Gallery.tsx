import { useEffect, useState } from 'react';
import { fetchGallery } from '../api';
import type { GalleryEntry } from '../types';

interface Props {
  refreshTrigger: number; // increment to force a refresh after new generation
}

export default function Gallery({ refreshTrigger }: Props) {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchGallery()
      .then(data => {
        if (!cancelled) setEntries(data.entries);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load gallery.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [refreshTrigger]);

  if (loading) {
    return (
      <section className="gallery-section" aria-label="Past posters gallery">
        <h3 className="gallery-section__heading">✦ Past Blockbusters ✦</h3>
        <p className="dimmed-text" style={{ fontSize: '0.85rem' }}>Loading gallery…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="gallery-section" aria-label="Past posters gallery">
        <h3 className="gallery-section__heading">✦ Past Blockbusters ✦</h3>
        <p style={{ color: 'var(--color-red-light)', fontSize: '0.85rem' }}>{error}</p>
      </section>
    );
  }

  if (entries.length === 0) {
    return (
      <section className="gallery-section" aria-label="Past posters gallery">
        <h3 className="gallery-section__heading">✦ Past Blockbusters ✦</h3>
        <p className="dimmed-text" style={{ fontSize: '0.85rem' }}>
          No blockbusters yet — be the first to create one!
        </p>
      </section>
    );
  }

  return (
    <section className="gallery-section" aria-label="Past posters gallery">
      <h3 className="gallery-section__heading">
        <span>🎟️</span>
        <span>Past Blockbusters</span>
      </h3>
      <div className="gallery-grid">
        {entries.map(entry => (
          <article key={entry.id} className="gallery-card">
            <div className="gallery-card__img-wrap">
              <img
                src={entry.posterUrl}
                alt={`Poster for ${entry.title}`}
                className="gallery-card__img"
                loading="lazy"
              />
              <div className="gallery-card__overlay">
                <p className="gallery-card__title">{entry.title}</p>
                {entry.tagline && (
                  <p className="gallery-card__tagline">"{entry.tagline}"</p>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
