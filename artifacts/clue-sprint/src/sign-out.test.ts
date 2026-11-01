import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { Header } from './App';

const auth = vi.hoisted(() => ({
  signedIn: true,
  signOut: vi.fn(),
}));

vi.mock('@clerk/react', async (importOriginal) => {
  return {
    ClerkProvider: () => null,
    SignIn: () => null,
    SignUp: () => null,
    useUser: () => ({ isSignedIn: auth.signedIn }),
    useClerk: () => ({ signOut: auth.signOut }),
  };
});

vi.mock('@workspace/api-client-react', () => ({
  getGetMyProfileQueryKey: () => ['profile'],
  useGetMyProfile: () => ({ data: { publicId: 'PuzzleFriend' } }),
}));

function renderHeader() {
  return render(
    createElement(Router, null, createElement(Header)),
  );
}

describe('signed-in header sign-out confirmation', () => {
  beforeEach(() => {
    auth.signedIn = true;
    auth.signOut.mockReset();
  });

  afterEach(() => cleanup());

  it('opens from the labeled trigger without ending the session', async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(screen.getByRole('alertdialog', { name: 'Sign out of Clue Sprint?' })).toBeTruthy();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="button-sign-out"]')).toBeTruthy();
  });

  it('exposes the dialog title and description to assistive technology', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Sign out of Clue Sprint?' });
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('You can sign back in whenever you’re ready to solve again.')).toBeTruthy();
  });

  it('closes on Cancel and leaves the session active', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('closes on Escape and leaves the session active', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('confirms sign-out with the app home route as the redirect target', async () => {
    const user = userEvent.setup();
    const view = renderHeader();
    auth.signOut.mockImplementation(async () => {
      auth.signedIn = false;
    });
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await user.click(screen.getByTestId('button-confirm-sign-out'));

    expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ redirectUrl: '/' });
    view.rerender(createElement(Router, null, createElement(Header)));
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Join the sprint' })).toBeTruthy();
  });
});

describe('sign-out dialog narrow layout', () => {
  it('stacks full-width actions at a narrow viewport breakpoint', () => {
    const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
    const narrowRules = css.match(/@media \(max-width: 600px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(narrowRules).toContain('.sign-out-dialog-actions { flex-direction: column-reverse; }');
    expect(narrowRules).toContain('.sign-out-dialog-actions > button { width: 100%; }');
  });
});
