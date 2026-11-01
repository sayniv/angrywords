import { createElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import App, { BrowseCluesLink, ClueLeaderboardSection, ExplorePage, Header, HomePage, NextClueRecommendation } from './App';

const api = vi.hoisted(() => ({
  listClues: vi.fn(),
  infiniteQuery: vi.fn(),
  solverLeaderboard: vi.fn(),
  setterLeaderboard: vi.fn(),
  getClue: vi.fn(),
  clueLeaderboard: vi.fn(),
  mutation: vi.fn(),
  nextRecommendation: vi.fn(),
  queryClient: undefined as { invalidateQueries: ReturnType<typeof vi.fn> } | undefined,
  user: undefined as { id: string } | undefined,
  profile: undefined as { data: { publicId: string; claimedPublicIds: string[]; isGuest: boolean; needsSetup: boolean; blurb: string | null } } | undefined,
}));

vi.mock('@clerk/react', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  SignIn: () => null,
  SignUp: () => null,
  useUser: () => ({ isLoaded: true, isSignedIn: Boolean(api.user), user: api.user }),
  useClerk: () => ({ addListener: () => () => {}, signOut: vi.fn() }),
}));

vi.mock('@clerk/react/internal', () => ({
  publishableKeyFromHost: () => 'pk_test_clue_sprint',
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useInfiniteQuery: api.infiniteQuery,
    useQueryClient: () => api.queryClient ?? actual.useQueryClient(),
  };
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
  useGetMyProfile: () => api.profile ?? ({ data: undefined }),
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

function renderClueLeaderboard(tier: 'gold' | 'silver' | 'bronze', category: 'gold' | 'hints-no-assist' | 'assist', overrides: Record<string, unknown> = {}) {
  const defaults = {
    tier,
    description: 'Tier board description',
    category,
    entries: [
      { rank: 1, displayName: 'First solver', elapsedSeconds: 63, attemptsUsed: 1, solvedAt: '2026-11-01T12:00:00Z' },
      { rank: 2, displayName: 'Second solver', elapsedSeconds: 81, attemptsUsed: 2, solvedAt: '2026-11-01T12:01:00Z' },
    ],
    loading: false,
    failed: false,
    retry: vi.fn(),
  };
  return render(createElement(ClueLeaderboardSection, { ...defaults, ...overrides } as Parameters<typeof ClueLeaderboardSection>[0]));
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
  const fetchNextPage = vi.fn().mockResolvedValue({ isError: false, data: { pages: [] } });
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
    api.queryClient = undefined;
    api.user = undefined;
    api.profile = undefined;
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

  it('marks the signed-in solver without changing their ranking details', () => {
    api.solverLeaderboard.mockReturnValue({
      data: [
        { rank: 1, displayName: 'PuzzleFriend', averageSeconds: 42.5, solvedCount: 8, isCurrentUser: true },
        { rank: 2, displayName: 'AnotherSolver', averageSeconds: 49, solvedCount: 6 },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    api.setterLeaderboard.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    renderWithRouter(createElement(HomePage));

    const ownRow = screen.getByTestId('row-solver-leader-1');
    expect(within(ownRow).getByTestId('text-current-solver').textContent).toBe('You');
    expect(ownRow.textContent).toContain('PuzzleFriend');
    expect(ownRow.textContent).toContain('8 solved');
    expect(ownRow.textContent).toContain('0:43');
  });

  it('keeps the solver board unmarked when no personal marker is returned', () => {
    api.solverLeaderboard.mockReturnValue({
      data: [{ rank: 1, displayName: 'PuzzleFriend', averageSeconds: 42.5, solvedCount: 8 }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    api.setterLeaderboard.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    renderWithRouter(createElement(HomePage));

    expect(screen.getByTestId('row-solver-leader-1').textContent).toContain('8 solved');
    expect(screen.queryByTestId('text-current-solver')).toBeNull();
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

  it('renders at most twenty compact clues per page and keeps cards linked to challenges', () => {
    const clues = Array.from({ length: 20 }, (_, index) => clue(index + 1));
    setupClueQuery({ data: { pages: [{ items: clues, nextCursor: 'next-page' }] }, hasNextPage: true });

    renderWithRouter(createElement(ExplorePage, { sort: 'newest' }));

    expect(screen.getByTestId('list-playable-clues').children).toHaveLength(20);
    expect(screen.getByTestId('card-clue-20').getAttribute('href')).toBe('/clue/clue-20');
    expect(screen.getByTestId('card-clue-20').className).toContain('clue-card-compact');
    expect(screen.getByTestId('button-previous-clues').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('button-next-clues')).toBeTruthy();
    expect(api.infiniteQuery).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: ['clues', { sort: 'newest' }],
      initialPageParam: null,
      getNextPageParam: expect.any(Function),
    }));
  });

  it('keeps compact clue rows and page controls usable on narrow screens and with a keyboard', () => {
    setupClueQuery({ data: { pages: [{ items: [clue(1)], nextCursor: 'next-page' }] }, hasNextPage: true });
    renderWithRouter(createElement(ExplorePage, { sort: 'newest' }));

    const card = screen.getByTestId('card-clue-1');
    expect(card.tagName).toBe('A');
    expect(card.className).toContain('clue-card-compact');
    expect(screen.getByRole('navigation', { name: 'Clue catalog pages' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Next/ }).tagName).toBe('BUTTON');

    const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
    const phoneRules = css.match(/@media \(max-width: 600px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(css).toContain('.clue-card-compact:focus-visible');
    expect(phoneRules).toContain('.clue-card-compact { grid-template-columns: minmax(0, 1fr);');
    expect(phoneRules).toContain('.catalog-pagination .button { flex: 1 1 auto;');
  });

  it('moves between already-loaded pages without duplicating clues or losing page position', async () => {
    setupClueQuery({
      data: { pages: [
        { items: [clue(20), clue(19)], nextCursor: 'page-two' },
        { items: [clue(18), clue(17)], nextCursor: null },
      ] },
    });

    renderWithRouter(createElement(ExplorePage, { sort: 'rating' }));

    expect(screen.getByTestId('link-highest-rated').getAttribute('href')).toBe('/explore/popular');
    expect(screen.getByTestId('link-highest-rated').getAttribute('aria-current')).toBe('page');
    expect(Array.from(screen.getByTestId('list-playable-clues').children, (card) => card.getAttribute('data-testid')))
      .toEqual(['card-clue-20', 'card-clue-19']);

    const user = userEvent.setup();
    await user.click(screen.getByTestId('button-next-clues'));
    expect(screen.getByTestId('text-clue-page').textContent).toBe('Page 2');
    expect(Array.from(screen.getByTestId('list-playable-clues').children, (card) => card.getAttribute('data-testid')))
      .toEqual(['card-clue-18', 'card-clue-17']);

    await user.click(screen.getByTestId('button-previous-clues'));
    expect(screen.getByTestId('text-clue-page').textContent).toBe('Page 1');
    expect(Array.from(screen.getByTestId('list-playable-clues').children, (card) => card.getAttribute('data-testid')))
      .toEqual(['card-clue-20', 'card-clue-19']);
  });

  it('requests the next cursor when the user advances beyond loaded pages', async () => {
    const { fetchNextPage } = setupClueQuery({
      data: { pages: [{ items: [clue(2)], nextCursor: 'after-clue-2' }] },
      hasNextPage: true,
    });
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
    await userEvent.setup().click(screen.getByTestId('button-next-clues'));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it('keeps the current page visible and offers retry after a next-page failure', async () => {
    const { fetchNextPage } = setupClueQuery({
      data: { pages: [{ items: [clue(2)], nextCursor: 'after-clue-2' }] },
      hasNextPage: true,
      isFetchNextPageError: true,
    });

    renderWithRouter(createElement(ExplorePage, { sort: 'newest' }));

    expect(screen.getByTestId('card-clue-2')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Your place is saved');
    expect(screen.getByTestId('button-next-clues').textContent).toContain('Try again');
    await userEvent.setup().click(screen.getByTestId('button-next-clues'));
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

  it('preserves API order for equally rated clues and consistently places unrated clues last', async () => {
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
      .toEqual(['card-clue-40', 'card-clue-30']);
    await userEvent.setup().click(screen.getByTestId('button-next-clues'));
    expect(Array.from(screen.getByTestId('list-playable-clues').children, (card) => card.getAttribute('data-testid')))
      .toEqual(['card-clue-50', 'card-clue-70', 'card-clue-55', 'card-clue-54']);
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

  it('refreshes the tier board after a successful solve and highlights the server-ranked entry', async () => {
    api.user = { id: 'current-solver' };
    api.profile = {
      data: { publicId: 'Current solver', claimedPublicIds: ['Current solver'], isGuest: false, needsSetup: false, blurb: null },
    };
    const slug = 'clue-81';
    const solvedAt = '2026-11-01T12:01:57.000Z';
    const updatedBoard = {
      noHintsNoAssist: [{
        rank: 3,
        displayName: 'Current solver',
        elapsedSeconds: 117,
        attemptsUsed: 2,
        solvedAt,
        isCurrentUser: true,
      }],
      hintsUsedNoAssist: [],
      assistUsed: [],
    };
    let leaderboardInvalidated = false;
    api.queryClient = {
      invalidateQueries: vi.fn(async ({ queryKey }: { queryKey: unknown[] }) => {
        if (queryKey[0] === 'clue-leaderboard' && queryKey[1] === slug) {
          leaderboardInvalidated = true;
        }
      }),
    };
    api.getClue.mockReturnValue({
      data: { ...challengeClue(81), userStartedAt: '2026-11-01T12:00:00.000Z', userAssistEnabled: false },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    api.clueLeaderboard.mockImplementation(() => ({
      data: leaderboardInvalidated
        ? updatedBoard
        : { noHintsNoAssist: [], hintsUsedNoAssist: [], assistUsed: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
    api.mutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        correct: true,
        attemptsUsed: 2,
        attemptsRemaining: 3,
        completed: true,
        elapsedSeconds: 117,
        message: 'That’s the one!',
      }),
      isPending: false,
      isError: false,
      reset: vi.fn(),
    });

    renderAppAt(`/clue/${slug}`);
    const user = userEvent.setup();
    await user.type(screen.getByTestId('input-guess'), 'answer');
    await user.click(screen.getByTestId('button-submit-guess'));

    await waitFor(() => {
      expect(screen.getByTestId('text-own-solve-gold').textContent).toBe('You');
    });
    expect(api.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['clue-leaderboard', slug],
    });
    expect(api.clueLeaderboard).toHaveBeenCalledWith(slug, expect.objectContaining({
      query: expect.objectContaining({
        queryKey: ['clue-leaderboard', slug, 'current-solver'],
      }),
    }));
    const personalRow = screen.getByTestId('row-leader-gold-3');
    expect(personalRow.textContent).toContain('03');
    expect(personalRow.textContent).toContain('1:57');
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

describe('Race So Far medal tiers', () => {
  afterEach(() => cleanup());

  it('labels the existing boards gold, silver, and bronze in their current order', () => {
    const tiers = [
      { tier: 'gold', category: 'gold', title: 'Gold' },
      { tier: 'silver', category: 'hints-no-assist', title: 'Silver' },
      { tier: 'bronze', category: 'assist', title: 'Bronze' },
    ] as const;
    const view = render(createElement('div', null, ...tiers.map(({ tier, category }) => createElement(ClueLeaderboardSection, {
      key: tier,
      tier,
      description: 'Tier board description',
      category,
      entries: [],
      loading: false,
      failed: false,
      retry: vi.fn(),
    }))));

    expect(Array.from(view.container.querySelectorAll('h3'), (heading) => heading.textContent))
      .toEqual(tiers.map(({ title }) => title));
    tiers.forEach(({ tier, category }) => {
      expect(screen.getByTestId(`section-leaderboard-${category}`).classList.contains(`clue-board-${tier}`)).toBe(true);
    });
  });

  it('shows the requested first-place icons while keeping later ranks numeric', () => {
    const tiers = [
      { tier: 'gold', category: 'gold', icon: 'lucide-crown' },
      { tier: 'silver', category: 'hints-no-assist', icon: 'chalice' },
      { tier: 'bronze', category: 'assist', icon: 'duck' },
    ] as const;

    tiers.forEach(({ tier, category, icon }) => {
      const view = renderClueLeaderboard(tier, category);
      const section = screen.getByTestId(`section-leaderboard-${category}`);
      const winner = section.querySelector('[aria-label="1st place"]');
      const iconSvg = winner?.querySelector('svg');

      expect(screen.getByRole('heading', { level: 3, name: tier[0].toUpperCase() + tier.slice(1) })).toBeTruthy();
      expect(winner).toBeTruthy();
      expect(iconSvg?.getAttribute('aria-hidden')).toBe('true');
      if (icon === 'lucide-crown') expect(iconSvg?.getAttribute('class')).toContain(icon);
      if (icon === 'chalice') expect(iconSvg?.querySelectorAll('path').length).toBe(2);
      if (icon === 'duck') expect(iconSvg?.querySelector('.duck-body')).toBeTruthy();
      expect(screen.getByTestId(`row-leader-${category}-2`).querySelector('.rank-badge')?.textContent).toBe('02');
      view.unmount();
    });
  });

  it('marks only the viewer’s solve without changing its rank or time', () => {
    const entries = [
      { rank: 1, displayName: 'First solver', elapsedSeconds: 63, attemptsUsed: 1, solvedAt: '2026-11-01T12:00:00Z' },
      { rank: 2, displayName: 'Your public ID', elapsedSeconds: 81, attemptsUsed: 2, solvedAt: '2026-11-01T12:01:00Z', isCurrentUser: true },
    ];
    renderClueLeaderboard('silver', 'hints-no-assist', { entries });

    expect(screen.getByTestId('text-own-solve-hints-no-assist').textContent).toBe('You');
    expect(screen.getByTestId('row-leader-hints-no-assist-2').textContent).toContain('02');
    expect(screen.getByTestId('row-leader-hints-no-assist-2').textContent).toContain('1:21');
    expect(screen.queryByTestId('text-own-solve-gold')).toBeNull();
  });

  it('defines distinct section, heading, and rank colors for all three tiers', () => {
    const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
    for (const tier of ['gold', 'silver', 'bronze']) {
      expect(css).toMatch(new RegExp(`\\.clue-board-${tier} \\{ background: #[0-9a-f]{6}; border-color: #[0-9a-f]{6}; \\}`));
      expect(css).toContain(`.clue-board-${tier} .clue-board-title h3`);
      expect(css).toContain(`.clue-board-${tier} .tier-rank-badge`);
    }
  });

  it('keeps tier labels, winner badges, ranks, and solve times readable on narrow phones', () => {
    const tiers = [
      { tier: 'gold', category: 'gold', description: 'Fastest solve, no hints' },
      { tier: 'silver', category: 'hints-no-assist', description: 'Solved with hints' },
      { tier: 'bronze', category: 'assist', description: 'Solved with assist mode' },
    ] as const;
    const view = render(createElement('div', null, ...tiers.map(({ tier, category, description }) => createElement(ClueLeaderboardSection, {
      key: tier,
      tier,
      description,
      category,
      entries: [
        { rank: 1, displayName: 'First solver', elapsedSeconds: 63, attemptsUsed: 1, solvedAt: '2026-11-01T12:00:00Z' },
        { rank: 2, displayName: 'Second solver', elapsedSeconds: 81, attemptsUsed: 2, solvedAt: '2026-11-01T12:01:00Z' },
      ],
      loading: false,
      failed: false,
      retry: vi.fn(),
    }))));

    for (const { tier, category, description } of tiers) {
      const section = screen.getByTestId(`section-leaderboard-${category}`);
      expect(section.querySelector('h3')?.textContent).toBe(tier[0].toUpperCase() + tier.slice(1));
      expect(section.querySelector('.clue-board-title > span')?.textContent).toBe(description);
      expect(section.querySelector('[aria-label="1st place"] svg')).toBeTruthy();
      expect(screen.getByTestId(`row-leader-${category}-2`).querySelector('.rank-badge')?.textContent).toBe('02');
      expect(section.querySelector('.leader-time')?.textContent).toBe('1:03');
    }

    const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
    const phoneRules = css.match(/@media \(max-width: 600px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(phoneRules).toContain('.clue-board-title { align-items: flex-start; flex-direction: column;');
    expect(phoneRules).toContain('.clue-board-title > span { font-size: 10px; text-align: left; }');
    expect(phoneRules).toContain('.tier-rank-badge { width: 30px; height: 30px; }');
    expect(phoneRules).toContain('.leader-time { flex: 0 0 auto; font-size: 12px; white-space: nowrap; }');
    view.unmount();
  });

  it('preserves loading, empty, error, and retry states', async () => {
    const loading = renderClueLeaderboard('gold', 'gold', { entries: undefined, loading: true });
    expect(loading.container.querySelector('.leader-skeleton')).toBeTruthy();
    loading.unmount();

    const empty = renderClueLeaderboard('silver', 'hints-no-assist', { entries: [] });
    expect(screen.getByText('No hint-used solves yet.')).toBeTruthy();
    empty.unmount();

    const retry = vi.fn();
    renderClueLeaderboard('bronze', 'assist', { entries: undefined, failed: true, retry });
    expect(screen.getByRole('alert').textContent).toContain('Could not load this board just now.');
    await userEvent.setup().click(screen.getByTestId('button-retry-leaderboard-assist'));
    expect(retry).toHaveBeenCalledOnce();
  });
});
