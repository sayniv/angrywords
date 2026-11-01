import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GuessFeedback } from './guess-feedback';

describe('GuessFeedback', () => {
  it('shows accessible green, yellow, and neutral states for each guessed letter', () => {
    render(<GuessFeedback guess="ALLEY" feedback={['green', 'yellow', 'neutral', 'yellow', 'neutral']} />);

    const letters = screen.getAllByRole('listitem');
    expect(letters).toHaveLength(5);
    expect(letters[0]?.getAttribute('aria-label')).toBe('A, correct position');
    expect(letters[0]?.classList.contains('feedback-green')).toBe(true);
    expect(letters[1]?.getAttribute('aria-label')).toBe('L, matching letter in another position');
    expect(letters[1]?.classList.contains('feedback-yellow')).toBe(true);
    expect(letters[2]?.getAttribute('aria-label')).toBe('L, not in the answer');
    expect(letters[2]?.classList.contains('feedback-neutral')).toBe(true);
  });

  it('renders no letter-position indicators when assist feedback is absent', () => {
    const { container } = render(<GuessFeedback guess="GUESS" />);
    expect(container.childElementCount).toBe(0);
  });
});
