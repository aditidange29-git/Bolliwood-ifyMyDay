interface Props {
  story: string;
}

export default function StoryPanel({ story }: Props) {
  // Split on double newlines to preserve paragraph breaks from the model
  const paragraphs = story
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean);

  return (
    <section className="story-panel" aria-label="Full Bollywood story">
      <h3 className="story-panel__heading">✦ The Full Story ✦</h3>
      <div className="story-panel__text">
        {paragraphs.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
    </section>
  );
}
