export type GuessFeedbackState = "green" | "yellow" | "neutral";

export function getGuessFeedback(guess: string, target: string): GuessFeedbackState[] {
  const guessLetters = [...guess];
  const targetLetters = [...target];
  const feedback: GuessFeedbackState[] = guessLetters.map(() => "neutral");
  const remaining = new Map<string, number>();

  for (let index = 0; index < guessLetters.length; index += 1) {
    if (guessLetters[index] === targetLetters[index]) {
      feedback[index] = "green";
    } else if (targetLetters[index] !== undefined) {
      const letter = targetLetters[index]!;
      remaining.set(letter, (remaining.get(letter) ?? 0) + 1);
    }
  }

  for (let index = 0; index < guessLetters.length; index += 1) {
    if (feedback[index] === "green") continue;
    const letter = guessLetters[index]!;
    const available = remaining.get(letter) ?? 0;
    if (available > 0) {
      feedback[index] = "yellow";
      remaining.set(letter, available - 1);
    }
  }

  return feedback;
}
