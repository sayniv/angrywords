import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import App, { ExplorePage, Header, HomePage } from './App';

const api = vi.hoisted(() => ({
  listClues: vi.fn(),
  solverLeaderboard: vi.fn(),
  setterLeaderboard: vi.fn(),
}));

vi.mock('@clerk/react', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  SignIn: () => null,
  SignUp: () => null,
  useUser: () => ({ isLoaded: true, isSignedIn: false }),
  useClerk: () => ({ addListener: () => () => {}, signOut: vi.fn() }),
}));

vi.mock('@clerk/react/internal', () => ({
  publishableKeyFromHost: () => 'pk_test_clue_sprint',
}));

vi.mock('@workspace/api-client-react', () => ({
  getGetMyProfileQueryKey: () => ['profile'],
  getGetSolverLeaderboardQueryKey: () => ['solver-leaderboard'],
  getGetSetterLeaderboardQueryKey: () => ['setter-leaderboard'],
  getListCluesQueryKey: (params?: unknown) => ['clues', params],
  useGetMyProfile: () => ({ data: undefined }),
  useGetSolverLeaderboard: api.solverLeaderboard,
  useGetSetterLeaderboard: api.setterLeaderboard,
  useListClues: api.listClues,
}));

function renderWithRouter(element: ReactNode) {
  return render(createElement(Router, null, element));
}

function renderAppAt(path: string) {
  window.history.replaceState({}, '', path);
  return render(createElement(App));
}

function clue(id: number) {
  return {
    id,
    slug: `clue-${id}`,
    clue: `A public clue ${id}`,
    answerLength: 5,
    maxAttempts: 5,
    setterName: 'PuzzleFriend',
    setterBlurb: null,
    solveCount: 0,
    averageRating: null,
    ratingCount: 0,
    isBlocked: false,
    createdAt: '2026-11-01T12:00:00.000Z',
  };
}

describe('Home and Explore destinations', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('shows separate Home and Explore links on desktop and mobile navigation', async () => {
    const user = userEvent.setup();
    renderWithRouter(createElement(Header, { active: 'home' }));

    const homeLink = screen.getByTestId('link-home');
    const exploreLink = screen.getByTestId('link-explore');
    expect(homeLink.getAttribute('href')).toBe('/');
    expect(exploreLink.getAttribute('href')).toBe('/explore');
    expect(homeLink.className).toContain('nav-active');
    expect(exploreLink.className).not.toContain('nav-active');

    await user.click(screen.getByRole('button', { name: 'Toggle navigation' }));
    expect(screen.getByTestId('mobile-link-home').getAttribute('href')).toBe('/');
    expect(screen.getByTestId('mobile-link-explore').getAttribute('href')).toBe('/explore');
  });

  it('keeps the landing introduction separate from the clue catalog', () => {
    api.solverLeaderboard.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    api.setterLeaderboard.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    api.listClues.mockReturnValue({ data: [clue(1)], isLoading: false, isError: false, refetch: vi.fn() });

    renderWithRouter(createElement(HomePage));

    expect(screen.getByRole('heading', { name: /Words witha twist/i })).toBeTruthy();
    expect(screen.getByTestId('link-find-clue').getAttribute('href')).toBe('/explore');
    expect(screen.queryByTestId('card-clue-1')).toBeNull();
    expect(api.listClues).not.toHaveBeenCalled();
  });

  it('renders every clue returned by the catalog and keeps cards linked to their challenges', () => {
    const clues = Array.from({ length: 35 }, (_, index) => clue(index + 1));
    api.listClues.mockReturnValue({ data: clues, isLoading: false, isError: false, refetch: vi.fn() });

    renderWithRouter(createElement(ExplorePage, { sort: 'newest' }));

    expect(screen.getByTestId('list-playable-clues').children).toHaveLength(35);
    expect(screen.getByTestId('card-clue-35').getAttribute('href')).toBe('/clue/clue-35');
    expect(api.listClues).toHaveBeenCalledWith(
      { sort: 'newest' },
      expect.objectContaining({ query: expect.objectContaining({ queryKey: ['clues', { sort: 'newest' }] }) }),
    );
  });

  it('offers the highest-rated route and retries failed catalog requests', async () => {
    const retry = vi.fn();
    api.listClues.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: retry });

    renderWithRouter(createElement(ExplorePage, { sort: 'rating' }));

    expect(screen.getByTestId('link-highest-rated').getAttribute('href')).toBe('/explore/popular');
    expect(screen.getByTestId('link-highest-rated').getAttribute('aria-current')).toBe('page');
    expect(api.listClues).toHaveBeenCalledWith(
      { sort: 'rating' },
      expect.objectContaining({ query: expect.objectContaining({ queryKey: ['clues', { sort: 'rating' }] }) }),
    );

    await userEvent.setup().click(screen.getByTestId('button-retry-clues'));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('preserves loading and empty catalog states', () => {
    api.listClues.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    const loadingView = renderWithRouter(createElement(ExplorePage, { sort: 'newest' }));
    expect(screen.getByLabelText('Loading clues')).toBeTruthy();
    loadingView.unmount();

    api.listClues.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    renderWithRouter(createElement(ExplorePage, { sort: 'newest' }));
    expect(screen.getByTestId('empty-playable-clues')).toBeTruthy();
  });

  it('opens the full playable catalog when /explore is loaded directly', () => {
    api.listClues.mockReturnValue({ data: [clue(1), clue(2)], isLoading: false, isError: false, refetch: vi.fn() });

    renderAppAt('/explore');

    expect(screen.getByRole('heading', { name: 'Explore clues' })).toBeTruthy();
    expect(screen.getByTestId('link-all-clues').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('list-playable-clues').children).toHaveLength(2);
    expect(api.listClues).toHaveBeenCalledWith(
      { sort: 'newest' },
      expect.objectContaining({ query: expect.objectContaining({ queryKey: ['clues', { sort: 'newest' }] }) }),
    );
  });

  it('opens the highest-rated catalog when /explore/popular is loaded directly', () => {
    api.listClues.mockReturnValue({ data: [clue(2), clue(1)], isLoading: false, isError: false, refetch: vi.fn() });

    renderAppAt('/explore/popular');

    expect(screen.getByRole('heading', { name: 'Most loved clues' })).toBeTruthy();
    expect(screen.getByTestId('link-highest-rated').getAttribute('aria-current')).toBe('page');
    expect(Array.from(screen.getByTestId('list-playable-clues').children, (card) => card.getAttribute('data-testid')))
      .toEqual(['card-clue-2', 'card-clue-1']);
    expect(api.listClues).toHaveBeenCalledWith(
      { sort: 'rating' },
      expect.objectContaining({ query: expect.objectContaining({ queryKey: ['clues', { sort: 'rating' }] }) }),
    );
  });

  it('keeps the selected view and ordering through browser back and forward', async () => {
    api.listClues.mockImplementation(({ sort }: { sort: 'newest' | 'rating' }) => ({
      data: sort === 'rating' ? [clue(2), clue(1)] : [clue(1), clue(2)],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));

    renderAppAt('/explore');
    const user = userEvent.setup();
    await user.click(screen.getByTestId('link-highest-rated'));

    expect(screen.getByRole('heading', { name: 'Most loved clues' })).toBeTruthy();
    expect(Array.from(screen.getByTestId('list-playable-clues').children, (card) => card.getAttribute('data-testid')))
      .toEqual(['card-clue-2', 'card-clue-1']);

    window.history.back();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Explore clues' })).toBeTruthy();
      expect(Array.from(screen.getByTestId('list-playable-clues').children, (card) => card.getAttribute('data-testid')))
        .toEqual(['card-clue-1', 'card-clue-2']);
    });

    window.history.forward();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Most loved clues' })).toBeTruthy();
      expect(Array.from(screen.getByTestId('list-playable-clues').children, (card) => card.getAttribute('data-testid')))
        .toEqual(['card-clue-2', 'card-clue-1']);
    });
  });
});
