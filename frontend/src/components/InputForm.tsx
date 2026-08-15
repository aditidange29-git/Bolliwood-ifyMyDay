import { useState, type FormEvent } from 'react';

interface Props {
  onSubmit: (dayText: string) => void;
  isLoading: boolean;
}

const MAX_CHARS = 500;

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
      <div className="input-form__footer">
        <span
          id="char-count"
          className="input-form__count"
          style={{ color: overLimit ? 'var(--color-red-light)' : undefined }}
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
          {isLoading ? '✦ Generating…' : '🎭 Bollywood-ify!'}
        </button>
      </div>
    </form>
  );
}
