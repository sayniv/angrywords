import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import App, { BrowseCluesLink, ExplorePage, Header, HomePage, NextClueRecommendation } from './App';

const api = vi.hoisted(() => ({
  listClues: vi.fn(),
  infiniteQuery: vi.fn(),
  solverLeaderboard: vi.fn(),
  setterLeaderboard: vi.fn(),
  getClue: vi.fn(),
  clueLeaderboard: vi.fn(),
  mutation: vi.fn(),
  nextRecommendation: vi.fn(),
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
  getGetClueQueryKey: (slug: string) => ['clue', slug],
  getGetClueLeaderboardQueryKey: (slug: string) => ['clue-leaderboard', slug],
  getGetMyDashboardQueryKey: () => ['dashboard'],
  getGetMyProfileQueryKey: () => ['profile'],
  getGetNextClueRecommendationQueryKey: (params: unknown) => ['recommendation', params],
  getGetSolverLeaderboardQueryKey: () => ['solver-leaderboard'],
  getGetSetterLeaderboardQueryKey: () => ['setter-leaderboard'],
  getListCluesQueryKey: (params?: unknown) => ['clues', params],
  listClues: api.listClues,
  useGetMyProfile: () => ({ data: undefined }),
  useGetClue: api.getClue,
  useGetClueLeaderboard: api.clueLeaderboard,
  useSubmitAttempt: api.mutation,
  useGiveUpClue: api.mutation,
  useRevealClueHint: api.mutation,
  useStartClue: api.mutation,
  useRetireClue: api.mutation,
  useRateClue: api.mutation,
  useReportClue: api.mutation,
  useSubmitClueAppeal: api.mutation,
  useGetSolverLeaderboard: api.solverLeaderboard,
  useGetSetterLeaderboard: api.setterLeaderboard,
  useGetNextClueRecommendation: api.nextRecommendation,
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

function challengeClue(id: number) {
  return {
    ...clue(id),
    wordplay: null,
    hintCount: 0,
    revealedAnswer: null,
    isOwner: false,
    isBlocked: false,
    userHasReported: false,
    userRevealedHints: [],
    userStartedAt: null,
    userAssistEnabled: null,
    userCompleted: null,
    userAttemptsUsed: null,
    userElapsedSeconds: null,
    userSolved: null,
    userRating: null,
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

function setupChallengeQueries() {
  const clues = new Map<string, ReturnType<typeof challengeClue>>();
  api.getClue.mockImplementation((slug: string) => {
    if (!clues.has(slug)) clues.set(slug, challengeClue(Number(slug.replace('clue-', ''))));
    return {
      data: clues.get(slug),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
  });
  api.clueLeaderboard.mockReturnValue({
    data: { noHintsNoAssist: [], hintsUsedNoAssist: [], assistUsed: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  api.mutation.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    reset: vi.fn(),
  });
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
    expect(screen.getByTestId('link-find-clue').textContent).toContain('Explore clues');
    expect(screen.queryByTestId('card-clue-1')).toBeNull();
    expect(api.listClues).not.toHaveBeenCalled();
  });

  it('routes clue-browse links from challenge and dashboard copy to the catalog', () => {
    renderWithRouter(createElement('div', null,
      createElement(BrowseCluesLink, { testId: 'link-auth-back-to-clues' }, 'Back to the clues'),
      createElement(BrowseCluesLink, { testId: 'link-challenge-all-clues' }, 'All clues'),
      createElement(BrowseCluesLink, { testId: 'link-challenge-browse-another' }, 'Browse another clue'),
      createElement(BrowseCluesLink, { testId: 'link-dashboard-browse-clues' }, 'Browse clues'),
      createElement(BrowseCluesLink, { testId: 'link-dashboard-whole-board' }, 'Browse the whole board'),
    ));

    for (const id of [
      'link-auth-back-to-clues',
      'link-challenge-all-clues',
      'link-challenge-browse-another',
      'link-dashboard-browse-clues',
      'link-dashboard-whole-board',
    ]) {
      expect(screen.getByTestId(id).getAttribute('href')).toBe('/explore');
    }
  });

  it('offers a recommendation only for successful solves and always keeps Explore available', () => {
    api.nextRecommendation.mockReturnValue({
      data: { clue: clue(12) },
      isLoading: false,
      isError: false,
    });
    const failedSolve = renderWithRouter(createElement(NextClueRecommendation, { successful: false, slug: 'current-clue' }));
    expect(screen.queryByTestId('panel-next-clue')).toBeNull();
    expect(api.nextRecommendation).toHaveBeenCalledWith(
      { excludeSlug: 'current-clue' },
      { query: { queryKey: ['recommendation', { excludeSlug: 'current-clue' }], enabled: false, staleTime: 15_000 } },
    );
    failedSolve.unmount();

    api.nextRecommendation.mockReturnValue({
      data: { clue: clue(12) },
      isLoading: false,
      isError: false,
    });
    renderWithRouter(createElement(NextClueRecommendation, { successful: true, slug: 'current-clue' }));
    expect(screen.getByTestId('link-recommended-clue').getAttribute('href')).toBe('/clue/clue-12');
    expect(screen.getByTestId('link-explore-after-solve').getAttribute('href')).toBe('/explore');
    expect(api.nextRecommendation).toHaveBeenLastCalledWith(
      { excludeSlug: 'current-clue' },
      { query: { queryKey: ['recommendation', { excludeSlug: 'current-clue' }], enabled: true, staleTime: 15_000 } },
    );
  });

  it('shows an Explore fallback when the recommendation is unavailable or fails to load', () => {
    api.nextRecommendation.mockReturnValue({ data: { clue: null }, isLoading: false, isError: false });
    const empty = renderWithRouter(createElement(NextClueRecommendation, { successful: true, slug: 'current-clue' }));
    expect(screen.getByText('You’ve solved every available clue so far.')).toBeTruthy();
    expect(screen.getByTestId('link-explore-after-solve').getAttribute('href')).toBe('/explore');
    empty.unmount();

    api.nextRecommendation.mockReturnValue({ isLoading: false, isError: true });
    renderWithRouter(createElement(NextClueRecommendation, { successful: true, slug: 'current-clue' }));
    expect(screen.getByText('We couldn’t load a recommendation just now.')).toBeTruthy();
    expect(screen.getByTestId('link-explore-after-solve').getAttribute('href')).toBe('/explore');
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

  it('uses the latest page cursor when requesting more playable clues', async () => {
    setupClueQuery({ data: { pages: [{ items: [clue(2)], nextCursor: 'after-clue-2' }] }, hasNextPage: true });
    api.listClues.mockResolvedValue({ items: [clue(1)], nextCursor: null });

    renderWithRouter(createElement(ExplorePage, { sort: 'newest' }));

    const options = api.infiniteQuery.mock.calls[0]?.[0] as {
      queryFn: (context: { pageParam: string | null; signal: AbortSignal }) => Promise<unknown>;
      getNextPageParam: (page: { nextCursor: string | null }) => string | undefined;
    };
    const cursor = options.getNextPageParam({ nextCursor: 'after-clue-2' });
    expect(cursor).toBe('after-clue-2');

    const signal = new AbortController().signal;
    await options.queryFn({ pageParam: cursor ?? null, signal });

    expect(api.listClues).toHaveBeenCalledWith(
      { sort: 'newest', cursor: 'after-clue-2' },
      { signal },
    );
    expect(screen.getByTestId('list-playable-clues').children).toHaveLength(1);
    expect(screen.getByTestId('card-clue-2')).toBeTruthy();
    expect(screen.queryByTestId('card-clue-1')).toBeNull();
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

  it('preserves API order for equally rated clues and consistently places unrated clues last', () => {
    const sameDate = '2026-11-01T12:00:00.000Z';
    const ratedHighId = { ...clue(40), averageRating: 4.5, ratingCount: 5, createdAt: sameDate };
    const ratedLowId = { ...clue(30), averageRating: 4.5, ratingCount: 5, createdAt: sameDate };
    const ratedFewerRatings = { ...clue(50), averageRating: 4.5, ratingCount: 2, createdAt: sameDate };
    const unratedNewer = { ...clue(70), createdAt: '2026-11-02T12:00:00.000Z' };
    const unratedHighId = { ...clue(55), createdAt: sameDate };
    const unratedLowId = { ...clue(54), createdAt: sameDate };
    setupClueQuery({
      data: {
        pages: [
          { items: [ratedHighId, ratedLowId], nextCursor: 'next-page' },
          { items: [ratedFewerRatings, unratedNewer, unratedHighId, unratedLowId], nextCursor: null },
        ],
      },
    });

    renderAppAt('/explore/popular');

    expect(Array.from(screen.getByTestId('list-playable-clues').children, (card) => card.getAttribute('data-testid')))
      .toEqual([
        'card-clue-40',
        'card-clue-30',
        'card-clue-50',
        'card-clue-70',
        'card-clue-55',
        'card-clue-54',
      ]);
    expect(screen.getByTestId('text-clue-rating-70').textContent).toContain('Not rated yet');
    expect(screen.getByTestId('text-clue-rating-55').textContent).toContain('Not rated yet');
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

  it('opens and reloads a clue URL directly', () => {
    setupChallengeQueries();

    const view = renderAppAt('/clue/clue-41');
    expect(screen.getByTestId('text-challenge-clue').textContent).toBe('A public clue 41');
    expect(api.getClue).toHaveBeenLastCalledWith('clue-41', expect.objectContaining({
      query: expect.objectContaining({ enabled: true }),
    }));

    view.unmount();
    render(createElement(App));

    expect(screen.getByTestId('text-challenge-clue').textContent).toBe('A public clue 41');
    expect(api.getClue).toHaveBeenLastCalledWith('clue-41', expect.objectContaining({
      query: expect.objectContaining({ enabled: true }),
    }));
  });

  it('returns to the catalog and reopens the same clue through browser history', async () => {
    setupChallengeQueries();
    api.listClues.mockReturnValue({
      data: [clue(42)],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    setupClueQuery({ data: { pages: [{ items: [clue(42)], nextCursor: null }] } });

    renderAppAt('/explore');
    await userEvent.setup().click(screen.getByTestId('card-clue-42'));
    expect(screen.getByTestId('text-challenge-clue').textContent).toBe('A public clue 42');
    expect(window.location.pathname).toBe('/clue/clue-42');

    window.history.back();
    await waitFor(() => {
      expect(window.location.pathname).toBe('/explore');
      expect(screen.getByTestId('card-clue-42')).toBeTruthy();
    });

    window.history.forward();
    await waitFor(() => {
      expect(window.location.pathname).toBe('/clue/clue-42');
      expect(screen.getByTestId('text-challenge-clue').textContent).toBe('A public clue 42');
    });
  });

  it('keeps distinct unavailable screens for retired and missing clue links', () => {
    setupChallengeQueries();
    api.getClue.mockImplementation((slug: string) => ({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: slug === 'retired-clue' ? 410 : 404 },
      refetch: vi.fn(),
    }));

    const retired = renderAppAt('/clue/retired-clue');
    expect(screen.getByRole('heading', { name: 'This clue has been retired.' })).toBeTruthy();
    retired.unmount();

    window.history.replaceState({}, '', '/clue/missing-clue');
    render(createElement(App));
    expect(screen.getByRole('heading', { name: 'This clue has slipped away.' })).toBeTruthy();
  });
});
