import { useState, type FormEvent } from 'react';

interface Props {
  onSubmit: (dayText: string) => void;
  isLoading: boolean;
}

const MAX_CHARS = 500;

const EXAMPLES = [
  { emoji: '☕', text: 'Spilled coffee on my laptop, got promoted the same afternoon' },
  { emoji: '🚌', text: 'Woke up late, missed the bus, and then aced my viva' },
  { emoji: '💔', text: 'Got rejected from my dream job and found a better one by evening' },
  { emoji: '🌧️', text: 'Got completely drenched in rain, then bumped into my school crush at the chai stall' },
  { emoji: '😤', text: 'Had a huge fight with my boss, then accidentally fixed a bug that saved the entire product' },
  { emoji: '🎂', text: 'Nobody remembered my birthday but a stranger paid for my lunch and called it destiny' },
];

export default function InputForm({ onSubmit, isLoading }: Props) {
  const [text, setText] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed);
  }

  const remaining = MAX_CHARS - text.length;
  const overLimit = remaining < 0;

  return (
    <form className="input-form" onSubmit={handleSubmit} aria-label="Bollywood-ify your day">
      <label className="input-form__label" htmlFor="day-input">
        Describe your day
      </label>
      <textarea
        id="day-input"
        className="input-form__textarea"
        placeholder="e.g. I spilled coffee on my laptop and then got promoted to senior engineer…"
        value={text}
        onChange={e => setText(e.target.value)}
        disabled={isLoading}
        rows={4}
        aria-describedby="char-count"
        maxLength={MAX_CHARS + 50}
      />

      {/* Example chips */}
      <div className="examples-section" aria-label="Example prompts">
        <p className="examples-label">✨ Try an example</p>
        <div className="examples-grid">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.text}
              type="button"
              className="example-chip"
              onClick={() => setText(ex.text)}
              disabled={isLoading}
              title={ex.text}
            >
              <span className="example-chip__emoji">{ex.emoji}</span>
              <span className="example-chip__text">{ex.text}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="input-form__footer">
        <span
          id="char-count"
          className="input-form__count"
          style={{ color: overLimit ? '#e11d48' : undefined }}
          aria-live="polite"
        >
          {overLimit ? `${Math.abs(remaining)} over limit` : `${remaining} chars remaining`}
        </span>
        <button
          type="submit"
          className="btn-primary"
          disabled={isLoading || !text.trim() || overLimit}
          aria-busy={isLoading}
        >
          {isLoading ? '⏳ Generating…' : '🎭 Bollywood-ify!'}
        </button>
      </div>
    </form>
  );
}
