export function GuessFeedback({ guess, feedback }: {
  guess: string;
  feedback?: Array<'green' | 'yellow' | 'neutral'>;
}) {
  if (!feedback?.length) return null;
  const letters = [...guess];
  return <ol className="guess-feedback" aria-label="Letter feedback for your guess" data-testid="guess-feedback">
    {feedback.map((state, index) => {
      const letter = letters[index] ?? '';
      const label = state === 'green'
        ? 'correct position'
        : state === 'yellow'
          ? 'matching letter in another position'
          : 'not in the answer';
      return <li key={`${index}-${letter}`} className={`guess-feedback-tile feedback-${state}`} aria-label={`${letter || 'Letter'}, ${label}`}>
        {letter}
      </li>;
    })}
  </ol>;
}
