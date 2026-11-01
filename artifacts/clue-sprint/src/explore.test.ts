import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import App, { ExplorePage, Header, HomePage } from './App';

const api = vi.hoisted(() => ({
  listClues: vi.fn(),
  infiniteQuery: vi.fn(),
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

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useInfiniteQuery: api.infiniteQuery };
});

vi.mock('@workspace/api-client-react', () => ({
  getGetMyProfileQueryKey: () => ['profile'],
  getGetSolverLeaderboardQueryKey: () => ['solver-leaderboard'],
  getGetSetterLeaderboardQueryKey: () => ['setter-leaderboard'],
  getListCluesQueryKey: (params?: unknown) => ['clues', params],
  listClues: api.listClues,
  useGetMyProfile: () => ({ data: undefined }),
  useGetSolverLeaderboard: api.solverLeaderboard,
  useGetSetterLeaderboard: api.setterLeaderboard,
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

function setupClueQuery(overrides: Record<string, unknown> = {}) {
  const fetchNextPage = vi.fn();
  const refetch = vi.fn();
  api.infiniteQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage,
    ...overrides,
  });
  return { fetchNextPage, refetch };
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

  it('renders the first clue page and keeps cards linked to their challenges', () => {
    const clues = Array.from({ length: 24 }, (_, index) => clue(index + 1));
    setupClueQuery({ data: { pages: [{ items: clues, nextCursor: 'next-page' }] }, hasNextPage: true });

    renderWithRouter(createElement(ExplorePage, { sort: 'newest' }));

    expect(screen.getByTestId('list-playable-clues').children).toHaveLength(24);
    expect(screen.getByTestId('card-clue-24').getAttribute('href')).toBe('/clue/clue-24');
    expect(screen.getByTestId('button-load-more-clues')).toBeTruthy();
    expect(api.infiniteQuery).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: ['clues', { sort: 'newest' }],
      initialPageParam: null,
      getNextPageParam: expect.any(Function),
    }));
  });

  it('appends later pages without losing earlier clues and allows retrying a failed next page', async () => {
    const { fetchNextPage } = setupClueQuery({
      data: { pages: [{ items: [clue(2), clue(1)], nextCursor: 'next-page' }, { items: [clue(3)], nextCursor: null }] },
      hasNextPage: true,
      isFetchNextPageError: true,
    });

    renderWithRouter(createElement(ExplorePage, { sort: 'rating' }));

    expect(screen.getByTestId('link-highest-rated').getAttribute('href')).toBe('/explore/popular');
    expect(screen.getByTestId('link-highest-rated').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('list-playable-clues').children).toHaveLength(3);
    expect(screen.getByTestId('card-clue-2')).toBeTruthy();
    expect(screen.getByTestId('card-clue-1')).toBeTruthy();
    expect(screen.getByTestId('card-clue-3')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Your place is saved');
    expect(screen.getByTestId('button-load-more-clues').textContent).toContain('Try again');

    await userEvent.setup().click(screen.getByTestId('button-load-more-clues'));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it('preserves loading and empty catalog states', () => {
    setupClueQuery({ isLoading: true });
    const loadingView = renderWithRouter(createElement(ExplorePage, { sort: 'newest' }));
    expect(screen.getByLabelText('Loading clues')).toBeTruthy();
    loadingView.unmount();

    setupClueQuery({ data: { pages: [{ items: [], nextCursor: null }] } });
    renderWithRouter(createElement(ExplorePage, { sort: 'newest' }));
    expect(screen.getByTestId('empty-playable-clues')).toBeTruthy();
  });

  it('opens the full playable catalog when /explore is loaded directly', () => {
    setupClueQuery({ data: { pages: [{ items: [clue(1), clue(2)], nextCursor: null }] } });

    renderAppAt('/explore');

    expect(screen.getByRole('heading', { name: 'Explore clues' })).toBeTruthy();
    expect(screen.getByTestId('link-all-clues').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('list-playable-clues').children).toHaveLength(2);
    expect(api.infiniteQuery).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: ['clues', { sort: 'newest' }],
    }));
  });

  it('opens the highest-rated catalog when /explore/popular is loaded directly', () => {
    setupClueQuery({ data: { pages: [{ items: [clue(2), clue(1)], nextCursor: null }] } });

    renderAppAt('/explore/popular');

    expect(screen.getByRole('heading', { name: 'Most loved clues' })).toBeTruthy();
    expect(screen.getByTestId('link-highest-rated').getAttribute('aria-current')).toBe('page');
    expect(Array.from(screen.getByTestId('list-playable-clues').children, (card) => card.getAttribute('data-testid')))
      .toEqual(['card-clue-2', 'card-clue-1']);
    expect(api.infiniteQuery).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: ['clues', { sort: 'rating' }],
    }));
  });

  it('keeps the selected view and ordering through browser back and forward', async () => {
    api.infiniteQuery.mockImplementation((options: { queryKey: [string, { sort: 'newest' | 'rating' }] }) => ({
      data: { pages: [{
        items: options.queryKey[1].sort === 'rating' ? [clue(2), clue(1)] : [clue(1), clue(2)],
        nextCursor: null,
      }] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      fetchNextPage: vi.fn(),
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

  it('retries an initial catalog failure', async () => {
    const { refetch } = setupClueQuery({ isError: true });

    renderWithRouter(createElement(ExplorePage, { sort: 'newest' }));

    await userEvent.setup().click(screen.getByTestId('button-retry-clues'));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
