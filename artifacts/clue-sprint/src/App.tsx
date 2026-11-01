import { type ReactNode, type FormEvent, useState, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ClerkProvider, SignIn, SignUp, useClerk, useUser,
} from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Check, Clock3, Copy, Flag,
  Crown, Feather, Lightbulb, LockKeyhole, LogOut, Menu, PenLine, RotateCcw, Sparkles,
  Star, Trash2, Trophy, X,
} from 'lucide-react';
import {
  getGetClueLeaderboardQueryKey, getGetClueQueryKey, getGetMyDashboardQueryKey, getMyActivity,
  getGetMyProfileQueryKey, getGetCluePublishQuotaQueryKey, getGetSetterLeaderboardQueryKey, getGetSolverLeaderboardQueryKey,
  getListPendingClueAppealsQueryKey,
  getListCluesQueryKey, useCreateClue, useDeleteMyAccount, useGetClue, useGetClueLeaderboard, useGetCluePublishQuota,
  useListPendingClueAppeals, useReviewClueAppeal, useSubmitClueAppeal,
  useGetMyDashboard, useGetMyProfile, useGetSetterLeaderboard, useGetSolverLeaderboard, useGiveUpClue,
  useListClues, useRateClue, useReportClue, useRetireClue, useRevealClueHint, useStartClue, useSubmitAttempt, useUpdateMyProfile,
  type ClueLeaderboard, type SolverActivity,
} from '@workspace/api-client-react';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { trackEvent } from '@/lib/analytics';
import { getSavedAttemptResult } from '@/lib/saved-attempt-result';
import { confirmHintReveal } from '@/lib/hint-confirmation';
import { GuessFeedback } from '@/components/guess-feedback';
import NotFound from '@/pages/not-found';
import TutorialPage from '@/pages/tutorial';
import {
  Link, Redirect, Route, Switch, useLocation, useParams, Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, refetchOnWindowFocus: false, retry: 1 } },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const appearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: 'top' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  variables: {
    colorPrimary: '#c94e3d',
    colorForeground: '#382c24',
    colorMutedForeground: '#75685e',
    colorDanger: '#bd3830',
    colorBackground: '#fbf8f0',
    colorInput: '#fffdf8',
    colorInputForeground: '#382c24',
    colorNeutral: '#d8cdbd',
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: '12px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbf8f0] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#ded3c2]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#382c24] font-semibold',
    headerSubtitle: 'text-[#75685e]',
    socialButtonsBlockButtonText: 'text-[#382c24] font-medium',
    formFieldLabel: 'text-[#382c24] font-medium',
    footerActionLink: 'text-[#b74436] font-semibold',
    footerActionText: 'text-[#75685e]',
    dividerText: 'text-[#75685e]',
    identityPreviewEditButton: 'text-[#b74436]',
    formFieldSuccessText: 'text-[#316d53]',
    alertText: 'text-[#382c24]',
    logoBox: 'mb-2',
    logoImage: 'max-h-10',
    socialButtonsBlockButton: 'border-[#ded3c2] bg-[#fffdf8] hover:bg-[#f4eee2]',
    formButtonPrimary: 'bg-[#c94e3d] hover:bg-[#a93d31] text-white',
    formFieldInput: 'bg-[#fffdf8] border-[#d8cdbd] text-[#382c24]',
    footerAction: 'border-0',
    dividerLine: 'bg-[#ded3c2]',
    alert: 'border-[#e4c5b7] bg-[#fff4ee]',
    otpCodeFieldInput: 'bg-[#fffdf8] border-[#d8cdbd]',
    formFieldRow: 'mb-4',
    main: 'gap-4',
  },
};

function ClerkCacheSync() {
  const { addListener } = useClerk();
  const cache = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) cache.clear();
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, cache]);
  return null;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={appearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Good to see you', subtitle: 'Pick up where the puzzle left off.' } },
        signUp: { start: { title: 'Join the solving circle', subtitle: 'A good clue is better shared.' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkCacheSync />
      <Switch>
        <Route path="/tutorial" component={TutorialRoute} />
        <Route>
          <ProfileGate>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route path="/create" component={CreateGate} />
              <Route path="/clue/:slug" component={ChallengePage} />
              <Route path="/dashboard" component={DashboardGate} />
              <Route path="/review" component={ReviewerGate} />
              <Route component={NotFound} />
            </Switch>
          </ProfileGate>
        </Route>
      </Switch>
    </ClerkProvider>
  );
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <RoutedErrorBoundary><ClerkRoutes /></RoutedErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function HomeRedirect() {
  const { isLoaded } = useUser();
  if (!isLoaded) return <PageSkeleton />;
  return <HomePage />;
}

function Protected({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <PageSkeleton />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <>{children}</>;
}

function ProfileGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  const profile = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey(), enabled: Boolean(isLoaded && isSignedIn) },
  });
  if (!isLoaded) return <PageSkeleton />;
  if (!isSignedIn) return <>{children}</>;
  if (profile.isLoading) return <PageSkeleton />;
  if (profile.isError || !profile.data) {
    return (
      <main className="page-wrap page-content">
        <div className="state-panel">
          <h2>Your profile could not load.</h2>
          <p>Try again to continue to your clues.</p>
          <button className="button button-outline" onClick={() => void profile.refetch()}>
            Retry <RotateCcw size={15} />
          </button>
        </div>
      </main>
    );
  }
  if (profile.data.needsSetup) return <ProfileSetupPage profile={profile.data} />;
  return <>{children}</>;
}

function ProfileSetupPage({ profile }: { profile: { publicId: string; isGuest: boolean; needsSetup: boolean } }) {
  const cache = useQueryClient();
  const updateProfile = useUpdateMyProfile();
  const [publicId, setPublicId] = useState('');
  const [error, setError] = useState('');
  const finishSetup = async (nextId?: string) => {
    setError('');
    try {
      await updateProfile.mutateAsync({ data: nextId ? { publicId: nextId.trim() } : {} });
      trackEvent('account_completed', {
        profile_setup: nextId ? 'custom_public_id' : 'generated_public_id',
      });
      await cache.invalidateQueries();
    } catch (cause) {
      const status = (cause as { status?: number }).status;
      setError(status === 409
        ? 'That ID is already taken. Choose another one.'
        : 'We could not save your public ID. Please try again.');
    }
  };
  return (
    <main className="page-wrap profile-setup-page">
      <div className="profile-setup-brand"><Brand /></div>
      <section className="paper-form profile-setup-card">
        <div className="eyebrow"><span className="eyebrow-dot" /> YOUR PUBLIC ID</div>
        <h1 className="page-title">Choose how<br /><em>you show up.</em></h1>
        <p className="profile-setup-copy">
          Your ID is the only name shown on clues and leaderboards. Your real name and email stay private.
        </p>
        <form onSubmit={(event) => { event.preventDefault(); void finishSetup(publicId); }}>
          <label className="field-label" htmlFor="public-id">Public ID</label>
          <input
            id="public-id"
            className="public-id-input"
            value={publicId}
            onChange={(event) => setPublicId(event.target.value)}
            placeholder="e.g. WordWiz27"
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,23}"
            autoComplete="nickname"
            required
          />
          <p className="profile-id-hint">3–24 letters, numbers, underscores, or hyphens. Avoid your real name or email.</p>
          {error && <div className="form-error" role="alert"><X size={16} />{error}</div>}
          <button className="button button-primary profile-save-button" type="submit" disabled={updateProfile.isPending}>
            {updateProfile.isPending ? 'Saving your ID…' : 'Use this public ID'} <ArrowRight size={16} />
          </button>
        </form>
        <div className="profile-divider"><span>OR</span></div>
        <div className="guest-id-choice">
          <div><span className="form-index">AUTO-GENERATED ID</span><strong>{profile.publicId}</strong><p>Keep this unique guest number instead.</p></div>
          <button className="button button-outline" type="button" disabled={updateProfile.isPending} onClick={() => void finishSetup()}>
            Continue as guest
          </button>
        </div>
      </section>
    </main>
  );
}

function CreateGate() { return <Protected><CreatePage /></Protected>; }
function DashboardGate() { return <Protected><DashboardPage /></Protected>; }

function SignInPage() {
  const requested = new URLSearchParams(window.location.search).get('next');
  const redirectUrl = requested?.startsWith('/') && !requested.startsWith('/sign-in') && !requested.startsWith('/sign-up')
    ? requested
    : `${basePath}/dashboard`;
  return <AuthFrame><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={redirectUrl} /></AuthFrame>;
}
function SignUpPage() {
  const requested = new URLSearchParams(window.location.search).get('next');
  const redirectUrl = requested?.startsWith('/') && !requested.startsWith('/sign-in') && !requested.startsWith('/sign-up')
    ? requested
    : `${basePath}/dashboard`;
  return <AuthFrame><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={redirectUrl} /></AuthFrame>;
}

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="auth-scene paper-grid min-h-[100dvh] px-5 py-10">
      <div className="mx-auto mb-8 flex max-w-5xl items-center justify-between">
        <Brand />
        <Link href="/" className="text-sm font-semibold text-ink/70 hover:text-tomato">Back to the clues</Link>
      </div>
      <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-[1fr_480px]">
        <div className="hidden lg:block">
          <div className="eyebrow mb-5"><span className="eyebrow-dot" /> YOUR PEOPLE. YOUR PUZZLES.</div>
          <h1 className="max-w-lg font-display text-6xl leading-[1.03] tracking-[-.045em]">A little wordplay goes a long way.</h1>
          <p className="mt-6 max-w-md text-lg leading-8 text-ink/65">Make a clue, send it to your circle, and see who gets there first.</p>
          <div className="mt-9 flex gap-2">
            {['ACROSS', 'DOWN', 'AGAIN'].map((word, index) => <span key={word} className={`mini-tile ${index === 1 ? 'mini-tile-accent' : ''}`}>{word}</span>)}
          </div>
        </div>
        <div className="auth-card">{children}</div>
      </div>
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand-lockup" aria-label="Clue Sprint home">
      <span className="brand-mark"><span /><span /><span /><span /></span>
      {!compact && <span className="brand-name">clue sprint<span className="brand-period">.</span></span>}
    </Link>
  );
}

function TutorialRoute() {
  return <><Header active="tutorial" /><TutorialPage /><Footer /></>;
}

export function Header({ active = 'browse' }: { active?: 'browse' | 'dashboard' | 'tutorial' }) {
  const { isSignedIn } = useUser();
  const { data: profile } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey(), enabled: Boolean(isSignedIn) },
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut } = useClerk();
  return (
    <header className="site-header">
      <div className="page-wrap flex h-[76px] items-center justify-between">
        <Brand />
        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/" className={`nav-link ${active === 'browse' ? 'nav-active' : ''}`}>Explore clues</Link>
          <Link href="/tutorial" className={`nav-link ${active === 'tutorial' ? 'nav-active' : ''}`}>Learn cryptics</Link>
          {isSignedIn && <Link href="/dashboard" className={`nav-link ${active === 'dashboard' ? 'nav-active' : ''}`}>My page</Link>}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          {isSignedIn ? (
            <>
              <span className="header-public-id" title="Your public ID">{profile?.publicId}</span>
              <Link href="/create" className="button button-primary button-small"><PenLine size={15} /> Set a clue</Link>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="header-sign-out" data-testid="button-sign-out" type="button">
                    <LogOut size={16} aria-hidden="true" />
                    <span>Sign out</span>
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent className="sign-out-dialog">
                  <AlertDialogHeader className="sign-out-dialog-header">
                    <AlertDialogTitle className="sign-out-dialog-title">Sign out of Clue Sprint?</AlertDialogTitle>
                    <AlertDialogDescription className="sign-out-dialog-description">
                      You can sign back in whenever you’re ready to solve again.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="sign-out-dialog-actions">
                    <AlertDialogCancel className="button button-quiet" data-testid="button-cancel-sign-out">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="button button-primary"
                      data-testid="button-confirm-sign-out"
                      onClick={() => void signOut({ redirectUrl: basePath || '/' })}
                    >
                      Sign out
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <>
              <Link href="/sign-in" className="text-button">Sign in</Link>
              <Link href="/sign-up" className="button button-primary button-small">Join the sprint <ArrowRight size={15} /></Link>
            </>
          )}
        </div>
        <button className="icon-button md:hidden" aria-label="Toggle navigation" onClick={() => setMobileOpen(!mobileOpen)}><Menu size={20} /></button>
      </div>
      {mobileOpen && <div className="mobile-menu md:hidden">
        <Link href="/" className="nav-link" onClick={() => setMobileOpen(false)}>Explore clues</Link>
        <Link href="/tutorial" className={`nav-link ${active === 'tutorial' ? 'nav-active' : ''}`} onClick={() => setMobileOpen(false)}>Learn cryptics</Link>
        {isSignedIn && <Link href="/dashboard" className="nav-link" onClick={() => setMobileOpen(false)}>My page</Link>}
        {isSignedIn ? <Link href="/create" className="button button-primary" onClick={() => setMobileOpen(false)}>Set a clue <PenLine size={15} /></Link> : <Link href="/sign-in" className="button button-primary" onClick={() => setMobileOpen(false)}>Sign in <ArrowRight size={15} /></Link>}
      </div>}
    </header>
  );
}

function HomePage() {
  const [sort, setSort] = useState<'newest' | 'rating'>('newest');
  const { data: clues, isLoading, isError, refetch } = useListClues({ sort }, {
    query: { queryKey: getListCluesQueryKey({ sort }), staleTime: 15_000 },
  });
  const solvers = useGetSolverLeaderboard({ query: { queryKey: getGetSolverLeaderboardQueryKey() } });
  const setters = useGetSetterLeaderboard({ query: { queryKey: getGetSetterLeaderboardQueryKey() } });
  return (
    <div className="min-h-[100dvh]">
      <Header />
      <main>
        <section className="hero-section">
          <div className="page-wrap hero-grid">
            <div className="hero-copy reveal-up">
              <div className="eyebrow"><span className="eyebrow-dot" /> THE FRIENDLY LITTLE CLUE RACE</div>
              <h1 className="hero-title">Words with<br /><em>a twist.</em></h1>
              <p className="hero-description">A cryptic clue from a friend. A handful of guesses. Bragging rights that last until the next one.</p>
              <div className="hero-actions">
                <a href="#open-clues" className="button button-primary">Find your first clue <ArrowDownRight size={17} /></a>
                <Link href="/sign-up" className="button button-quiet">Set one for friends <ArrowUpRight size={16} /></Link>
              </div>
              <div className="hero-note"><span className="note-rule" /> Made for the group chat that loves a puzzle.</div>
            </div>
            <div className="hero-art reveal-up" aria-label="A playful crossword-inspired puzzle illustration">
              <div className="art-stamp">TODAY'S<br />BRAIN TICKLE</div>
              <div className="crossword-board">
                {[
                  ['B','R','A','I','N'], ['L','', 'R','', 'E'], ['O','W','D','P','A'], ['O','', 'E','', 'S'], ['M','I','N','D','Y'],
                ].flatMap((row, ri) => row.map((letter, ci) => <div className={`cross-cell ${letter ? '' : 'cross-cell-blank'} ${ri === 2 && ci === 2 ? 'cross-cell-center' : ''}`} key={`${ri}-${ci}`}>{letter}</div>))}
              </div>
              <div className="art-caption"><span className="caption-line" /> GET THE ANSWER. GET THE GLORY.</div>
              <span className="scribble scribble-one">?</span><span className="scribble scribble-two">!</span>
              <div className="art-check">5<br /><small>TRIES</small></div>
            </div>
          </div>
          <div className="ticker"><div className="ticker-track"><span>Think sideways</span><Sparkles size={13} /><span>Race your friends</span><Sparkles size={13} /><span>Share the aha</span><Sparkles size={13} /><span>Think sideways</span><Sparkles size={13} /><span>Race your friends</span><Sparkles size={13} /><span>Share the aha</span><Sparkles size={13} /></div></div>
        </section>

        <section id="open-clues" className="clues-section">
          <div className="page-wrap">
            <div className="section-topline">
              <div><div className="eyebrow"><span className="eyebrow-dot" /> OPEN FOR SOLVING</div><h2 className="section-title">Fresh from the setters</h2></div>
              <div className="clue-tools"><p className="section-aside">A clue is a tiny mystery.<br />Pick one and have a go.</p>
                <label className="sort-control">SORT BY <select data-testid="select-clue-sort" value={sort} onChange={(event) => setSort(event.target.value as 'newest' | 'rating')}><option value="newest">Newest</option><option value="rating">Top rated</option></select></label>
              </div>
            </div>
            {isLoading ? <ClueSkeletons /> : isError ? (
              <div className="state-panel"><h3>Clues are taking a breather.</h3><p>Give it another try in a moment.</p><button className="button button-outline" onClick={() => refetch()}>Try again <RotateCcw size={15} /></button></div>
            ) : clues?.length ? (
              <div className="clue-grid">
                {clues.map((clue, index) => <ClueCard key={clue.id} clue={clue} index={index} />)}
              </div>
            ) : (
              <div className="empty-clues">
                <div className="empty-stamp"><Feather size={27} /></div><div><h3>It's quiet on the clue front.</h3><p>Be the first to leave a little wordplay behind.</p></div>
                <Link href="/sign-up" className="button button-primary">Set the first clue <ArrowRight size={15} /></Link>
              </div>
            )}
            <div className="bottom-invite"><span className="invite-star"><Sparkles size={18} /></span><p>Have a clue rattling around in your head?</p><Link href="/sign-up">Bring it to the table <ArrowRight size={15} /></Link></div>
          </div>
        </section>
        <section className="public-leaderboards">
          <div className="page-wrap">
            <div className="section-topline"><div><div className="eyebrow"><span className="eyebrow-dot" /> THE FRIENDLY RIVALRY</div><h2 className="section-title">Good minds, good clues.</h2></div><p className="section-aside">Two ways to earn a little glory.</p></div>
            <div className="public-board-grid">
              <PublicLeaderboard title="Quickest solvers" note="Average time on successful solves" mode="solver" data={solvers.data} loading={solvers.isLoading} failed={solvers.isError} retry={() => void solvers.refetch()} />
              <PublicLeaderboard title="Beloved setters" note="Average star rating from solvers" mode="setter" data={setters.data} loading={setters.isLoading} failed={setters.isError} retry={() => void setters.refetch()} />
            </div>
          </div>
        </section>
        <section className="how-section">
          <div className="page-wrap how-grid">
            <div><div className="eyebrow"><span className="eyebrow-dot" /> HOW THE SPRINT WORKS</div><h2 className="section-title">Three small steps.<br /><em>One big aha.</em></h2></div>
            <div className="how-steps">
              <Step number="01" icon={<PenLine size={19} />} title="A setter drops a clue" text="Someone in your circle writes a cryptic clue and keeps the answer under wraps." />
              <Step number="02" icon={<Clock3 size={19} />} title="You take your shot" text="Make a guess, work the wordplay, and see how quickly the answer clicks." />
              <Step number="03" icon={<Trophy size={19} />} title="The fastest gets the crown" text="Every clue has its own little leaderboard. Your place is yours to defend." />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function ClueCard({ clue, index }: { clue: { id: number; slug: string; clue: string; answerLength: number; maxAttempts: number; setterName: string; setterBlurb?: string | null; solveCount: number; averageRating?: number | null; ratingCount?: number; isBlocked?: boolean }; index: number }) {
  return (
    <Link href={`/clue/${clue.slug}`} className={`clue-card reveal-up clue-card-${index % 3}`} data-testid={`card-clue-${clue.id}`}>
      <div className="card-meta"><span className="clue-number">CLUE NO. {String(clue.id).padStart(3, '0')}</span><span className="card-arrow"><ArrowUpRight size={17} /></span></div>
      <p className="card-clue-text">{clue.clue}</p>
      <div className="answer-slots">{Array.from({ length: Math.min(clue.answerLength, 12) }, (_, i) => <i key={i} />)}<span>{clue.answerLength} letters</span></div>
      {clue.setterBlurb && <p className="setter-blurb-card" data-testid={`text-setter-blurb-${clue.id}`}>{clue.setterBlurb}</p>}
      <div className="card-footer"><span>by <strong>{clue.setterName}</strong></span><span className="solve-count"><Trophy size={14} /> {clue.solveCount} solved</span></div>
      <div className="card-rating" data-testid={`text-clue-rating-${clue.id}`}><Star size={13} fill="currentColor" /> {clue.averageRating == null ? 'Not rated yet' : `${clue.averageRating.toFixed(1)} · ${clue.ratingCount ?? 0} ratings`}</div>
      {clue.isBlocked && <div className="clue-blocked-badge" data-testid={`badge-clue-blocked-${clue.id}`}><Flag size={13} /> Blocked after 100 reports</div>}
    </Link>
  );
}

function PublicLeaderboard({ title, note, mode, data, loading, failed, retry }: {
  title: string; note: string; mode: 'solver' | 'setter';
  data?: Array<{ rank: number; displayName: string; averageSeconds?: number; solvedCount?: number; averageRating?: number; ratingCount?: number }>;
  loading: boolean; failed: boolean; retry: () => void;
}) {
  return <section className="public-board" data-testid={`leaderboard-${mode}`}>
    <div className="board-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> {mode === 'solver' ? 'SOLVERS' : 'SETTERS'}</div><h3>{title}</h3></div><Trophy size={21} /></div>
    <p className="board-subtitle">{note}</p>
    {loading ? <LeaderboardSkeleton /> : failed ? <div className="board-empty"><p>Could not load the rankings.</p><button className="text-button" onClick={retry}>Try again</button></div> : data?.length ? <ol className="leaderboard">
      {data.slice(0, 5).map((entry) => <li className={`leader-row ${entry.rank === 1 ? 'leader-first' : ''}`} key={`${mode}-${entry.rank}-${entry.displayName}`} data-testid={`row-${mode}-leader-${entry.rank}`}>
        <span className={`rank-badge rank-${entry.rank}`}>{entry.rank === 1 ? <Crown size={15} /> : String(entry.rank).padStart(2, '0')}</span>
        <div className="leader-person"><strong>{entry.displayName}</strong><span>{mode === 'solver' ? `${entry.solvedCount ?? 0} solved` : `${entry.ratingCount ?? 0} ratings`}</span></div>
        <span className="leader-time">{mode === 'solver' ? formatTime(Math.round(entry.averageSeconds ?? 0)) : <span className="rating-inline"><Star size={13} fill="currentColor" /> {(entry.averageRating ?? 0).toFixed(1)}</span>}</span>
      </li>)}
    </ol> : <div className="board-empty"><div className="empty-medal"><Trophy size={20} /></div><strong>The board is waiting.</strong><p>Be among the first to make your mark.</p></div>}
  </section>;
}

function ClueLeaderboardSection({ title, category, entries, loading, failed, retry }: {
  title: string;
  category: 'gold' | 'hints-no-assist' | 'assist';
  entries?: ClueLeaderboard['noHintsNoAssist'];
  loading: boolean;
  failed: boolean;
  retry: () => void;
}) {
  const headingId = `clue-board-${category}-heading`;
  return <section className="clue-board-category" aria-labelledby={headingId} data-testid={`section-leaderboard-${category}`}>
    <h3 id={headingId}>{title}</h3>
    {loading ? <LeaderboardSkeleton /> : failed ? (
      <div className="board-empty" role="alert">
        <p>Could not load this board just now.</p>
        <button className="text-button" type="button" data-testid={`button-retry-leaderboard-${category}`} onClick={retry}>Try again</button>
      </div>
    ) : entries?.length ? (
      <ol className="leaderboard" data-testid={`list-leaderboard-${category}`}>
        {entries.map((entry) => <li className={`leader-row ${entry.rank === 1 ? 'leader-first' : ''}`} key={`${entry.rank}-${entry.displayName}-${entry.solvedAt}`} data-testid={`row-leader-${category}-${entry.rank}`}>
          <span className={`rank-badge rank-${entry.rank}`}>{entry.rank === 1 ? <Crown size={15} /> : String(entry.rank).padStart(2, '0')}</span>
          <div className="leader-person"><strong>{entry.displayName}</strong><span>{entry.attemptsUsed} {entry.attemptsUsed === 1 ? 'guess' : 'guesses'}</span></div>
          <span className="leader-time">{formatTime(entry.elapsedSeconds)}</span>
        </li>)}
      </ol>
    ) : (
      <div className="board-empty">
        <div className="empty-medal"><Trophy size={20} /></div>
        <strong>
          {category === 'gold'
            ? 'No gold-tier solves yet.'
            : category === 'assist'
              ? 'No assist-mode solves yet.'
              : 'No hint-used solves yet.'}
        </strong>
        <p>Be the first name on this board.</p>
      </div>
    )}
  </section>;
}

function Step({ number, icon, title, text }: { number: string; icon: ReactNode; title: string; text: string }) {
  return <div className="how-step"><div className="step-icon">{icon}</div><span className="step-number">{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>;
}

function CreatePage() {
  const [, setLocation] = useLocation();
  const cache = useQueryClient();
  const createClue = useCreateClue();
  const publishQuota = useGetCluePublishQuota({
    query: {
      queryKey: getGetCluePublishQuotaQueryKey(),
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchOnMount: 'always',
    },
  });
  const [clue, setClue] = useState('');
  const [answer, setAnswer] = useState('');
  const [wordplay, setWordplay] = useState('');
  const [hints, setHints] = useState<string[]>([]);
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [error, setError] = useState('');
  const [review, setReview] = useState(false);
  const normalizedAnswer = answer.trim().replace(/[^a-z0-9]/gi, '');
  useEffect(() => {
    const resetsAt = publishQuota.data?.resetsAt;
    if (!resetsAt) return;
    const delay = Date.parse(resetsAt) - Date.now();
    if (delay <= 0) {
      void publishQuota.refetch();
      return;
    }
    const timeout = window.setTimeout(() => void publishQuota.refetch(), delay + 100);
    return () => window.clearTimeout(timeout);
  }, [publishQuota.data?.resetsAt, publishQuota.refetch]);
  const quotaMessage = publishQuota.isLoading
    ? 'Checking today’s publishing count…'
    : publishQuota.isError || !publishQuota.data
      ? 'Today’s publishing count is unavailable; the limit is still enforced.'
      : publishQuota.data.remaining === 0
        ? `You’ve used all ${publishQuota.data.limit} publications today. The count resets at 00:00 UTC.`
        : `You can publish ${publishQuota.data.remaining} more ${publishQuota.data.remaining === 1 ? 'clue' : 'clues'} today (${publishQuota.data.publishedToday} of ${publishQuota.data.limit} used).`;
  const publishQuotaStatus = (
    <p className="form-footnote" role="status" data-testid="status-publish-quota">
      {quotaMessage}
      {publishQuota.isError && <> <button type="button" className="text-button" onClick={() => void publishQuota.refetch()}>Try again</button></>}
    </p>
  );
  const validateDraft = () => {
    setError('');
    if (clue.trim().length < 4) { setError('A clue needs at least four characters.'); return false; }
    if (!normalizedAnswer) { setError('Add the answer so the sprint can check guesses.'); return false; }
    if (!wordplay.trim()) { setError('Add a short explanation so solvers can enjoy the reveal.'); return false; }
    if (hints.length > 3 || hints.some((hint) => !hint.trim() || hint.trim().length > 300)) {
      setError('Each hint must contain 1–300 characters. Remove any empty hint; you can add up to three.');
      return false;
    }
    return true;
  };
  const submitDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validateDraft()) setReview(true);
  };
  const publish = async () => {
    setError('');
    try {
      const created = await createClue.mutateAsync({ data: {
        clue: clue.trim(), answer: normalizedAnswer.toUpperCase(),
        wordplay: wordplay.trim(), maxAttempts,
        hints: hints.map((hint) => hint.trim()),
      } });
      trackEvent('clue_published', {
        max_attempts: maxAttempts,
        clue_length_chars: clue.trim().length,
        answer_length: normalizedAnswer.length,
      });
      await Promise.all([
        cache.invalidateQueries({ queryKey: getListCluesQueryKey() }),
        cache.invalidateQueries({ queryKey: getGetMyDashboardQueryKey() }),
        cache.invalidateQueries({ queryKey: getGetCluePublishQuotaQueryKey() }),
      ]);
      setLocation(`/clue/${created.slug}`);
    } catch (cause) {
      setError(apiErrorMessage(cause, 'That clue could not be published. Please check it and try again.'));
    }
  };
  return <><Header /><main className="page-wrap page-content">
    <Link href="/dashboard" className="back-link"><ArrowLeft size={15} /> My page</Link>
    <div className="form-layout">
      <div className="form-intro"><div className="eyebrow"><span className="eyebrow-dot" /> SETTER'S DESK</div><h1 className="page-title">Make them<br /><em>think twice.</em></h1><p>Write the clue your friends will be turning over in their heads all afternoon.</p>
        <div className="setter-note"><Lightbulb size={17} /><p><strong>A setter's secret</strong><br />A fair clue has a definition and a bit of wordplay. Keep your explanation close; the big reveal comes after the solve.</p></div>
      </div>
      {!review ? <form className="paper-form" onSubmit={submitDraft}>
        <div className="form-heading"><span className="form-index">01 / THE CLUE</span><h2>What will they solve?</h2></div>
        {publishQuotaStatus}
        <label className="field-label" htmlFor="clue-text">Your cryptic clue</label>
        <textarea id="clue-text" data-testid="input-clue" value={clue} onChange={(e) => setClue(e.target.value)} placeholder="Example: Bird in a muddle, perhaps (5)" maxLength={240} required rows={3} />
        <div className="field-hint"><span>Just the clue. No answer clues.</span><span>{clue.length}/240</span></div>

        <div className="form-divider" />
        <div className="form-heading"><span className="form-index">02 / THE ANSWER</span><h2>Keep this one secret.</h2></div>
        <label className="field-label" htmlFor="clue-answer">Answer</label>
        <input id="clue-answer" data-testid="input-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="The answer" maxLength={40} required />
        <div className="answer-length"><div className="mini-answer-slots">{Array.from({ length: Math.min(normalizedAnswer.length || 5, 12) }, (_, i) => <i key={i} />)}</div><span>{normalizedAnswer.length || 0} letters</span></div>
         <label className="field-label mt-6" htmlFor="clue-wordplay">Wordplay explanation</label>
         <textarea id="clue-wordplay" data-testid="input-wordplay" value={wordplay} onChange={(e) => setWordplay(e.target.value)} placeholder="How does the clue lead to the answer?" maxLength={1000} rows={2} required />

        <div className="form-divider" />
        <div className="attempt-control"><div><span className="form-index">03 / GIVE THEM A FEW SHOTS</span><h2>Maximum attempts</h2><p>How many guesses before the answer is revealed?</p></div><div className="attempt-stepper"><button type="button" aria-label="Fewer attempts" onClick={() => setMaxAttempts(Math.max(1, maxAttempts - 1))}><span>−</span></button><strong data-testid="text-max-attempts">{maxAttempts}</strong><button type="button" aria-label="More attempts" onClick={() => setMaxAttempts(Math.min(10, maxAttempts + 1))}><span>+</span></button></div></div>
        <div className="form-divider" />
        <div className="form-heading"><span className="form-index">04 / OPTIONAL HELP</span><h2>Add up to three hints.</h2></div>
        <p className="hint-authoring-note">Solvers reveal hints in order. Each one adds one minute to their recorded time.</p>
        {hints.map((hint, index) => <div className="hint-input-row" key={index}>
          <label className="field-label" htmlFor={`clue-hint-${index}`}>Hint {index + 1}</label>
          <textarea
            id={`clue-hint-${index}`}
            data-testid={`input-hint-${index + 1}`}
            value={hint}
            onChange={(event) => setHints((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))}
            placeholder={`A gentle nudge for solvers`}
            maxLength={300}
            rows={2}
          />
          <div className="field-hint"><span>{hint.length}/300 characters</span><button type="button" className="text-button" aria-label={`Remove hint ${index + 1}`} onClick={() => setHints((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>
        </div>)}
        {hints.length < 3 && <button type="button" className="button button-outline add-hint-button" data-testid="button-add-hint" onClick={() => setHints((current) => [...current, ''])}><Lightbulb size={15} /> Add a hint {hints.length ? `(${hints.length}/3)` : ''}</button>}
        {error && <div className="form-error" role="alert"><X size={16} />{error}</div>}
        <button className="button button-primary publish-button" type="submit" data-testid="button-review-clue">
          Review your clue <ArrowRight size={17} />
        </button>
        <p className="form-footnote">You will see the full clue before it goes live.</p>
      </form> : <section className="paper-form publish-review" data-testid="panel-publish-review">
        <div className="form-heading"><span className="form-index">FINAL CHECK / BEFORE THE SPRINT</span><h2>Read it once as a solver.</h2></div>
        <p className="review-intro">Here is exactly what will be published. You can publish up to 10 clues per UTC day; the limit resets at 00:00 UTC.</p>
        {publishQuotaStatus}
        <dl className="review-details">
          <div><dt>Cryptic clue</dt><dd data-testid="review-clue">{clue.trim()}</dd></div>
          <div><dt>Answer</dt><dd data-testid="review-answer">{normalizedAnswer.toUpperCase()}</dd></div>
          <div><dt>Setter's wordplay note</dt><dd data-testid="review-wordplay">{wordplay.trim()}</dd></div>
          <div><dt>Attempt limit</dt><dd data-testid="review-attempt-limit">{maxAttempts} {maxAttempts === 1 ? 'guess' : 'guesses'}</dd></div>
          {hints.length ? hints.map((hint, index) => <div key={index}><dt>Hint {index + 1}</dt><dd data-testid={`review-hint-${index + 1}`}>{hint.trim()}</dd></div>) : <div><dt>Hints</dt><dd data-testid="review-hints-empty">No hints added</dd></div>}
        </dl>
        <div className="publish-warning" role="note"><LockKeyhole size={17} /><p><strong>Published clues cannot be edited.</strong><br />You can retire a clue later, but its wording and answer will stay as published.</p></div>
        {error && <div className="form-error" role="alert" data-testid="status-publish-error"><X size={16} />{error}</div>}
        <div className="review-actions">
          <button className="button button-outline" type="button" data-testid="button-back-to-edit" onClick={() => { setError(''); setReview(false); }}><ArrowLeft size={15} /> Back to edit</button>
          <button className="button button-primary" type="button" data-testid="button-publish" disabled={createClue.isPending} onClick={() => void publish()}>
            {createClue.isPending ? 'Publishing…' : 'Publish for good'} {createClue.isPending ? <span className="button-dots">···</span> : <ArrowRight size={17} />}
          </button>
        </div>
      </section>}
    </div>
  </main><Footer /></>;
}

function ChallengePage() {
  const params = useParamsSafe();
  const slug = params.slug || '';
  const { isLoaded: authLoaded, isSignedIn, user } = useUser();
  const clueQueryKey = [
    ...getGetClueQueryKey(slug),
    authLoaded && isSignedIn ? user?.id ?? 'signed-in' : 'signed-out',
  ];
  const { data: clue, isLoading, isError, error, refetch } = useGetClue(slug, {
    query: { queryKey: clueQueryKey, enabled: authLoaded },
  });
  const { data: leaderboard, isLoading: leaderboardLoading, isError: leaderboardError, refetch: refetchLeaderboard } =
    useGetClueLeaderboard(slug, { query: { queryKey: getGetClueLeaderboardQueryKey(slug), staleTime: 15_000, refetchOnMount: 'always' } });
  const submitAttempt = useSubmitAttempt();
  const giveUpClue = useGiveUpClue();
  const revealClueHint = useRevealClueHint();
  const startClue = useStartClue();
  const cache = useQueryClient();
  const [answer, setAnswer] = useState('');
  const [assistEnabled, setAssistEnabled] = useState(false);
  const [lastGuess, setLastGuess] = useState('');
  const [result, setResult] = useState<import('@workspace/api-client-react').AttemptResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [retiredLocally, setRetiredLocally] = useState(false);
  const retireClue = useRetireClue();
  const rateClue = useRateClue();
  const reportClue = useReportClue();
  const submitAppeal = useSubmitClueAppeal();
  const appealForm = useForm<{ reason: string }>({
    resolver: zodResolver(z.object({
      reason: z.string().trim().min(10, 'Please explain why the reports are mistaken.').max(1000),
    })),
    defaultValues: { reason: '' },
  });
  const [ratingChoice, setRatingChoice] = useState(0);
  const [ratingError, setRatingError] = useState('');
  const [reportNotice, setReportNotice] = useState('');
  const [reportError, setReportError] = useState('');
  const [giveUpError, setGiveUpError] = useState('');
  const [hintError, setHintError] = useState('');
  const [revealedHints, setRevealedHints] = useState<string[]>([]);
  const [localElapsed, setLocalElapsed] = useState(0);
  useEffect(() => {
    setResult(null);
    setAnswer('');
    setAssistEnabled(false);
    setLastGuess('');
    setCopied(false);
    setRatingChoice(0);
    setRatingError('');
    setReportNotice('');
    setReportError('');
    setGiveUpError('');
    setHintError('');
    setRevealedHints([]);
    startClue.reset();
  }, [slug, startClue.reset]);
  useEffect(() => {
    setRevealedHints(clue?.userRevealedHints ?? []);
  }, [slug, clue?.userRevealedHints]);
  const persistedStart = startClue.data?.startedAt || clue?.userStartedAt;
  const startedAt = persistedStart ? new Date(persistedStart).getTime() : null;
  useEffect(() => {
    if (clue?.userStartedAt && clue.userAssistEnabled !== null) {
      setAssistEnabled(clue.userAssistEnabled);
    }
  }, [slug, clue?.userStartedAt, clue?.userAssistEnabled]);
  const handleStart = async () => {
    try {
      const progress = await startClue.mutateAsync({ slug, data: { assistEnabled } });
      setAssistEnabled(progress.assistEnabled);
      await cache.invalidateQueries({ queryKey: getGetClueQueryKey(slug) });
    } catch {
      // The start panel displays the mutation error and allows a retry.
    }
  };
  useEffect(() => {
    if (result?.completed || clue?.userCompleted || !startedAt) {
      setLocalElapsed(clue?.userElapsedSeconds ?? 0);
      return;
    }
    const updateTimer = () => setLocalElapsed(Math.floor((Date.now() - startedAt) / 1000) + revealedHints.length * 60);
    updateTimer();
    const timer = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, result?.completed, clue?.userCompleted, clue?.userElapsedSeconds, revealedHints.length]);
  const savedResult = getSavedAttemptResult(clue);
  const visibleResult = result ?? savedResult;
  const visibleFeedback =
    visibleResult && 'feedback' in visibleResult ? visibleResult.feedback : undefined;
  const copyChallengeLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };
  const handleRetire = async () => {
    if (!window.confirm('Retire this clue? It will stop accepting guesses and disappear from browsing. Existing attempts and leaderboard history will be kept, but the shared link will show that the clue is retired.')) return;
    try {
      await retireClue.mutateAsync({ slug });
      setRetiredLocally(true);
      await Promise.all([
        cache.invalidateQueries({ queryKey: getListCluesQueryKey() }),
        cache.invalidateQueries({ queryKey: getGetMyDashboardQueryKey() }),
      ]);
    } catch {
      window.alert('The clue could not be retired. Please try again.');
    }
  };
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!answer.trim() || !clue) return;
    const submittedGuess = answer.toLocaleUpperCase('en').replace(/[^A-Z0-9]/g, '');
    setLastGuess('');
    setResult(null);
    try {
      const next = await submitAttempt.mutateAsync({
        slug,
        data: { answer: answer.trim() },
      });
      if (next.correct) {
        trackEvent('successful_solve', {
          attempts_used: next.attemptsUsed,
          elapsed_seconds: next.elapsedSeconds,
          max_attempts: clue.maxAttempts,
          answer_length: clue.answerLength,
        });
      }
      setResult(next);
      setLastGuess(submittedGuess);
      setAnswer('');
      await Promise.all([
        cache.invalidateQueries({ queryKey: getGetClueLeaderboardQueryKey(slug) }),
        cache.invalidateQueries({ queryKey: getGetClueQueryKey(slug) }),
        cache.invalidateQueries({ queryKey: getGetMyDashboardQueryKey() }),
      ]);
    } catch (cause) {
      if (hasHttpStatus(cause, 410)) {
        await cache.invalidateQueries({ queryKey: getGetClueQueryKey(slug) });
        return;
      }
      setResult({ correct: false, attemptsUsed: result?.attemptsUsed || 0, attemptsRemaining: result?.attemptsRemaining ?? clue.maxAttempts, completed: false, elapsedSeconds: 0, message: apiErrorMessage(cause, 'Your guess could not be sent. Please try again.') });
    }
  };
  const handleGiveUp = async () => {
    if (!clue || visibleResult?.completed || giveUpClue.isPending) return;
    if (!window.confirm('Give up on this clue? This ends your run and reveals the answer and wordplay.')) return;
    setGiveUpError('');
    try {
      const next = await giveUpClue.mutateAsync({ slug });
      setResult(next);
      setAnswer('');
      await Promise.all([
        cache.invalidateQueries({ queryKey: getGetClueQueryKey(slug) }),
        cache.invalidateQueries({ queryKey: getGetClueLeaderboardQueryKey(slug) }),
        cache.invalidateQueries({ queryKey: getGetMyDashboardQueryKey() }),
      ]);
    } catch (cause) {
      if (hasHttpStatus(cause, 410)) {
        await cache.invalidateQueries({ queryKey: getGetClueQueryKey(slug) });
        return;
      }
      setGiveUpError(apiErrorMessage(cause, 'You could not give up on this clue. Please try again.'));
    }
  };
  const handleRevealHint = async () => {
    if (!clue || visibleResult?.completed || revealedHints.length >= clue.hintCount || revealClueHint.isPending) return;
    setHintError('');
    try {
      const next = await confirmHintReveal(
        () => window.confirm(`Reveal hint ${revealedHints.length + 1}? This adds 1 minute to your recorded solve time. Continue?`),
        () => revealClueHint.mutateAsync({ slug }),
      );
      if (!next) return;
      setRevealedHints((current) => [...current, next.hint]);
      await cache.invalidateQueries({ queryKey: clueQueryKey });
    } catch (cause) {
      if (hasHttpStatus(cause, 410)) {
        await cache.invalidateQueries({ queryKey: clueQueryKey });
        return;
      }
      setHintError(apiErrorMessage(cause, 'The hint could not be revealed. Please try again.'));
    }
  };
  const submitRating = async (rating: number) => {
    setRatingError('');
    setRatingChoice(rating);
    try {
      await rateClue.mutateAsync({ slug, data: { rating } });
      await Promise.all([
        cache.invalidateQueries({ queryKey: getGetClueQueryKey(slug) }),
        cache.invalidateQueries({ queryKey: getListCluesQueryKey() }),
        cache.invalidateQueries({ queryKey: getGetSetterLeaderboardQueryKey() }),
      ]);
    } catch (cause) {
      if (hasHttpStatus(cause, 410)) void cache.invalidateQueries({ queryKey: getGetClueQueryKey(slug) });
      setRatingChoice(0);
      setRatingError(apiErrorMessage(cause, 'Your rating could not be saved. Please try again.'));
    }
  };
  const handleReport = async () => {
    setReportNotice('');
    setReportError('');
    if (!authLoaded) return;
    if (!isSignedIn) {
      window.location.assign(`${basePath}/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (!clue || clue.isOwner || clue.userHasReported) return;
    try {
      const report = await reportClue.mutateAsync({ slug });
      await Promise.all([
        cache.invalidateQueries({ queryKey: getGetClueQueryKey(slug) }),
        cache.invalidateQueries({ queryKey: getGetClueLeaderboardQueryKey(slug) }),
        cache.invalidateQueries({ queryKey: getListCluesQueryKey() }),
        cache.invalidateQueries({ queryKey: getGetMyDashboardQueryKey() }),
      ]);
      setReportNotice(report.blocked
        ? 'This clue reached 100 reports and is now blocked.'
        : report.alreadyReported
          ? 'You have already reported this clue.'
          : 'Thanks. Your report has been recorded.');
    } catch (cause) {
      if (hasHttpStatus(cause, 410)) void cache.invalidateQueries({ queryKey: getGetClueQueryKey(slug) });
      setReportError(apiErrorMessage(cause, 'Your report could not be recorded. Please try again.'));
    }
  };
  const handleAppeal = async ({ reason }: { reason: string }) => {
    if (!clue?.isOwner) return;
    try {
      await submitAppeal.mutateAsync({ slug, data: { reason: reason.trim() } });
      appealForm.reset({ reason: '' });
      await Promise.all([
        cache.invalidateQueries({ queryKey: getGetClueQueryKey(slug) }),
        cache.invalidateQueries({ queryKey: getGetMyDashboardQueryKey() }),
      ]);
    } catch (cause) {
      appealForm.setError('root', { message: apiErrorMessage(cause, 'Your appeal could not be submitted. Please try again.') });
    }
  };
  const errorStatus = (error as { status?: number } | null)?.status;
  const blockedError = errorStatus === 410 && apiErrorMessage(error, '').toLowerCase().includes('blocked');
  return <><Header /><main className="page-wrap challenge-page">
    <Link href="/" className="back-link"><ArrowLeft size={15} /> All clues</Link>
    {reportNotice && <div className="report-feedback" role="status" data-testid="status-report-success"><Flag size={15} /> {reportNotice}</div>}
    {reportError && <div className="form-error" role="alert" data-testid="status-report-error"><X size={16} /> {reportError}</div>}
    {retiredLocally ? <div className="state-panel"><h2>Clue retired.</h2><p>It no longer accepts guesses. Existing attempts and leaderboard history have been preserved.</p><Link href="/dashboard" className="button button-outline">Back to your page <ArrowRight size={15} /></Link></div> :
      isLoading ? <ChallengeSkeleton /> : isError || !clue ? <div className="state-panel"><h2>{errorStatus === 410 ? blockedError ? 'This clue has been blocked.' : 'This clue has been retired.' : 'This clue has slipped away.'}</h2><p>{errorStatus === 410 ? blockedError ? 'It reached 100 community reports and is no longer available. Solve and rating history is preserved.' : 'The setter retired this challenge. Its old shared link is no longer active.' : 'It may have been moved, or the link may be mistyped.'}</p>{errorStatus === 410 ? <Link href="/" className="button button-outline">Browse current clues <ArrowRight size={15} /></Link> : <button className="button button-outline" onClick={() => refetch()}>Try again <RotateCcw size={15} /></button>}</div> :
      <div className="challenge-layout">
        <section className="challenge-main">
          <div className="challenge-overline"><span className="eyebrow-dot" /> A CLUE FROM {clue.setterName.toUpperCase()}<span className="challenge-date">{new Date(clue.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><div className="challenge-actions"><button className="share-link-button" data-testid="button-copy-clue-link" onClick={copyChallengeLink} type="button"><Copy size={13} /> {copied ? 'Link copied' : 'Copy challenge link'}</button>{!clue.isOwner && <button className="share-link-button report-button" data-testid="button-report-clue" onClick={() => void handleReport()} type="button" disabled={!authLoaded || reportClue.isPending || clue.userHasReported}><Flag size={13} /> {reportClue.isPending ? 'Reporting…' : clue.userHasReported ? 'Reported' : 'Report'}</button>}</div></div>
          <div className="challenge-paper">
            <div className="challenge-paper-top"><span>THE DAILY TICKLE</span><span>NO. {String(clue.id).padStart(3, '0')}</span></div>
            <h1 className="challenge-clue" data-testid="text-challenge-clue">{clue.clue}</h1>
            <div className="answer-slots challenge-slots">{Array.from({ length: Math.min(clue.answerLength, 14) }, (_, i) => <i key={i} />)}<span>{clue.answerLength} letters</span></div>
            <div className="challenge-paper-bottom"><span>SET BY <strong>{clue.setterName}</strong></span><span>CRYPTIC / {clue.answerLength}</span></div>
          </div>
          {clue.setterBlurb && <div className="setter-blurb-detail" data-testid="text-setter-blurb-detail"><span className="form-index">A NOTE FROM THE SETTER</span><p>{clue.setterBlurb}</p></div>}
          {clue.isOwner && clue.wordplay && <div className="owner-note"><Lightbulb size={17} /><div><strong>Your setter's note</strong><p>{clue.wordplay}</p></div></div>}
          {clue.isOwner ? (
            <>
              <div className="owner-note"><Lightbulb size={17} /><div><strong>{clue.isBlocked ? 'Your clue is blocked' : 'Your clue is live'}</strong><p>The answer is <b>{clue.revealedAnswer}</b>. Published wording is locked. {clue.isBlocked ? 'Only a reviewer can restore it after considering your appeal.' : 'Share the challenge link and see who solves it fastest.'}</p></div></div>
              {clue.isBlocked && <section className="appeal-panel" data-testid="panel-clue-appeal">
                <span className="form-index">COMMUNITY REPORT REVIEW</span>
                <h2>This clue is blocked.</h2>
                <p>It received {clue.reportCount ?? 100} distinct reports and is hidden from solving. Your solve and rating history remains intact.</p>
                {clue.appealStatus === 'pending' ? <div className="appeal-pending" role="status" data-testid="status-appeal-pending"><strong>Your appeal is with a reviewer.</strong><p>{clue.appealReason}</p></div> : <Form {...appealForm}>
                  <form className="appeal-form" onSubmit={appealForm.handleSubmit(handleAppeal)}>
                    <FormField control={appealForm.control} name="reason" render={({ field }) => <FormItem>
                      <FormLabel>Why should this clue be restored?</FormLabel>
                      <FormControl><textarea {...field} data-testid="input-appeal-reason" rows={4} maxLength={1000} placeholder="Explain why you believe the reports are mistaken or coordinated." /></FormControl>
                      <FormMessage />
                    </FormItem>} />
                    {appealForm.formState.errors.root && <div className="form-error" role="alert" data-testid="status-appeal-error">{appealForm.formState.errors.root.message}</div>}
                    <button className="button button-primary" type="submit" data-testid="button-submit-appeal" disabled={submitAppeal.isPending}>
                      {submitAppeal.isPending ? 'Sending appeal…' : 'Request a review'} <ArrowRight size={15} />
                    </button>
                  </form>
                </Form>}
              </section>}
              <div className="owner-actions">
                <button className="button button-danger-outline" type="button" disabled={retireClue.isPending} onClick={() => void handleRetire()}><Trash2 size={15} /> {retireClue.isPending ? 'Retiring…' : 'Retire clue'}</button>
              </div>
            </>
          ) : !isSignedIn ? (
            <div className="guess-panel"><div className="guess-top"><div><span className="form-index">READY WHEN YOU ARE</span><h2>Join the race</h2></div><div className="timer-chip"><Clock3 size={14} /> {formatTime(0)}</div></div><p className="board-subtitle">Sign in to start your timer and save your attempts across devices.</p><Link href={`/sign-in?next=${encodeURIComponent(window.location.pathname)}`} className="button button-primary">Sign in to solve <ArrowRight size={16} /></Link></div>
          ) : visibleResult?.completed ? (
            <div className="solved-panel">
              <div className="solved-burst"><Trophy size={25} /></div><span className="form-index">AHA MOMENT</span>
              <h2>{visibleResult.correct ? 'You cracked it.' : 'The answer is revealed.'}</h2>
              <p>{visibleResult.message || (visibleResult.correct ? `Solved in ${formatTime(visibleResult.elapsedSeconds)}.` : 'The clue got the better of this round. There is always the next one.')}</p>
              <GuessFeedback guess={lastGuess} feedback={visibleFeedback} />
              <div className="solved-word">{clue.revealedAnswer || 'SPRINT COMPLETE'} <span>{visibleResult.attemptsUsed} {visibleResult.attemptsUsed === 1 ? 'guess' : 'guesses'}</span></div>
              {clue.wordplay && <div className="reveal-note"><Lightbulb size={16} /><div><strong>Setter's explanation</strong><p>{clue.wordplay}</p></div></div>}
              {visibleResult.correct && <div className="rating-panel" data-testid="panel-clue-rating">
                <span className="form-index">A QUICK THANKS TO THE SETTER</span><h3>How was this clue?</h3>
                {clue.userRating ? <p className="rating-saved" data-testid="text-rating-saved">Your rating: {clue.userRating} out of 5 stars</p> : <p>Rate the little mystery you just solved.</p>}
                <div className="rating-stars" role="group" aria-label="Rate clue from one to five stars">
                  {[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} data-testid={`button-rate-${value}`} aria-label={`Rate ${value} out of 5 stars`} aria-pressed={ratingChoice === value || clue.userRating === value} disabled={rateClue.isPending} onClick={() => void submitRating(value)}><Star size={24} fill={(ratingChoice || clue.userRating || 0) >= value ? 'currentColor' : 'none'} /></button>)}
                </div>
                {ratingError && <div className="form-error" role="alert" data-testid="status-rating-error">{ratingError}</div>}
              </div>}
            </div>
          ) : !persistedStart ? (
            <div className="guess-panel solve-start-panel">
              <div className="guess-top"><div><span className="form-index">READY WHEN YOU ARE</span><h2>Choose your sprint</h2></div><div className="timer-chip"><Clock3 size={14} /> {formatTime(0)}</div></div>
              <p className="board-subtitle">Choose a play style before your timer starts. This choice is locked for this run.</p>
              <label className="assist-choice" data-testid="choice-assist-mode">
                <input
                  type="checkbox"
                  checked={assistEnabled}
                  onChange={(event) => setAssistEnabled(event.target.checked)}
                  disabled={startClue.isPending}
                />
                <span><strong>Assist mode</strong><small>Show green and yellow letter-position feedback after each guess.</small></span>
              </label>
              {startClue.isError && <div className="form-error" role="alert">Your run could not start. Try again.</div>}
              <button className="button button-primary" type="button" data-testid="button-start-solve" onClick={() => void handleStart()} disabled={startClue.isPending}>
                {startClue.isPending ? 'Starting…' : 'Start solving'} <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <form className="guess-panel" onSubmit={handleSubmit}>
              <div className="guess-top"><div><span className="form-index">YOUR TURN</span><h2>What's your answer?</h2></div><div className="timer-chip"><Clock3 size={14} /> {formatTime(localElapsed)}</div></div>
              <div className="guess-entry"><input data-testid="input-guess" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your guess…" autoComplete="off" aria-label="Your answer guess" /><button className="button button-primary" type="submit" data-testid="button-submit-guess" disabled={submitAttempt.isPending || !answer.trim()}>Guess it <ArrowRight size={16} /></button></div>
              <div className="guess-bottom"><div className="attempt-dots">{Array.from({ length: clue.maxAttempts }, (_, i) => <i className={i < (visibleResult?.attemptsUsed || 0) ? 'attempt-used' : ''} key={i} />)}</div><span>{visibleResult ? `${visibleResult.attemptsRemaining} ${visibleResult.attemptsRemaining === 1 ? 'guess' : 'guesses'} left` : `${clue.maxAttempts} guesses to crack it`}</span></div>
              {revealedHints.length > 0 && <ol className="revealed-hints" data-testid="list-revealed-hints">
                {revealedHints.map((hint, index) => <li key={`${index}-${hint}`}><span>HINT {index + 1}</span><p>{hint}</p></li>)}
              </ol>}
              {clue.hintCount > revealedHints.length && <div className="hint-reveal">
                <div><strong>Need a nudge?</strong><p>Each hint adds one minute to your recorded solve time.</p></div>
                <button className="button button-outline" type="button" data-testid="button-reveal-hint" onClick={() => void handleRevealHint()} disabled={revealClueHint.isPending}>
                  {revealClueHint.isPending ? 'Revealing…' : `Reveal hint ${revealedHints.length + 1} · +1:00`}
                </button>
              </div>}
              {hintError && <div className="form-error" role="alert" data-testid="status-hint-error">{hintError}</div>}
              <GuessFeedback guess={lastGuess} feedback={visibleFeedback} />
              {visibleResult && <div className={`attempt-result ${visibleResult.correct ? 'result-correct' : 'result-wrong'}`} role="status"><span>{visibleResult.correct ? <Check size={17} /> : <X size={17} />}</span><div><strong>{visibleResult.message || (visibleResult.correct ? 'That’s the one!' : 'Not quite. Keep turning it over.')}</strong>{visibleResult.correct && <p>You got it in {formatTime(visibleResult.elapsedSeconds)}. Your time is on the board.</p>}</div></div>}
              <div className="give-up-row">
                <button className="button button-danger-outline" type="button" data-testid="button-give-up" onClick={() => void handleGiveUp()} disabled={giveUpClue.isPending || !persistedStart}>
                  {giveUpClue.isPending ? 'Revealing…' : 'Give up'}
                </button>
              </div>
              {giveUpError && <div className="form-error" role="alert" data-testid="status-give-up-error">{giveUpError}</div>}
            </form>
          )}
        </section>
        <aside className="challenge-aside">
          <div className="board-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> THE RACE SO FAR</div><h2>Fastest solves</h2></div><Trophy size={22} /></div>
          <p className="board-subtitle">Each run appears on one board based on its assist and hint settings.</p>
          <ClueLeaderboardSection
            title="Gold · No hints, no assist"
            category="gold"
            entries={leaderboard?.noHintsNoAssist}
            loading={leaderboardLoading}
            failed={leaderboardError}
            retry={() => void refetchLeaderboard()}
          />
          <ClueLeaderboardSection
            title="Hints · No assist"
            category="hints-no-assist"
            entries={leaderboard?.hintsUsedNoAssist}
            loading={leaderboardLoading}
            failed={leaderboardError}
            retry={() => void refetchLeaderboard()}
          />
          <ClueLeaderboardSection
            title="Assist · With or without hints"
            category="assist"
            entries={leaderboard?.assistUsed}
            loading={leaderboardLoading}
            failed={leaderboardError}
            retry={() => void refetchLeaderboard()}
          />
          <div className="board-footnote"><span className="board-star"><Sparkles size={18} /></span><span>Fastest time wins.<br />Hint penalties are included.</span></div>
          <Link href="/" className="board-browse">Browse another clue <ArrowRight size={15} /></Link>
        </aside>
      </div>
    }
  </main><Footer /></>;
}

function ReviewerGate() {
  return <Protected><ReviewerPage /></Protected>;
}

function ReviewerPage() {
  const { data: appeals, isLoading, isError, error, refetch } = useListPendingClueAppeals({
    query: { queryKey: getListPendingClueAppealsQueryKey(), refetchOnMount: 'always' },
  });
  const reviewAppeal = useReviewClueAppeal();
  const cache = useQueryClient();
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const decide = async (appealId: number, slug: string, action: 'restore' | 'retire') => {
    setActionError('');
    setNotice('');
    try {
      const result = await reviewAppeal.mutateAsync({ appealId, data: { action } });
      await Promise.all([
        cache.invalidateQueries({ queryKey: getListPendingClueAppealsQueryKey() }),
        cache.invalidateQueries({ queryKey: getGetClueQueryKey(slug) }),
        cache.invalidateQueries({ queryKey: getListCluesQueryKey() }),
        cache.invalidateQueries({ queryKey: getGetMyDashboardQueryKey() }),
      ]);
      setNotice(result.status === 'restored' ? 'The clue has been restored.' : 'The clue has been retired.');
    } catch (cause) {
      setActionError(apiErrorMessage(cause, 'The review decision could not be saved. Please try again.'));
    }
  };
  const errorStatus = (error as { status?: number } | null)?.status;
  return <><Header active="dashboard" /><main className="page-wrap dashboard-page review-page">
    <Link href="/dashboard" className="back-link"><ArrowLeft size={15} /> Your page</Link>
    <div className="eyebrow"><span className="eyebrow-dot" /> CLUE MODERATION</div>
    <h1 className="page-title">Appeals to review</h1>
    <p className="review-page-intro">Check the clue, its report count, and the setter’s explanation. Your decision is recorded.</p>
    {notice && <div className="save-confirmation" role="status" data-testid="status-review-success"><Check size={15} /> {notice}</div>}
    {actionError && <div className="form-error" role="alert" data-testid="status-review-error"><X size={16} /> {actionError}</div>}
    {isLoading ? <div className="state-panel"><h2>Loading appeals…</h2></div> : isError ? <div className="state-panel">
      <h2>{errorStatus === 403 ? 'Reviewer access required.' : 'The review queue is unavailable.'}</h2>
      <p>{errorStatus === 403 ? 'This account is not configured to review clue appeals.' : apiErrorMessage(error, 'Please try again.')}</p>
      {errorStatus !== 403 && <button className="button button-outline" onClick={() => void refetch()}>Try again <RotateCcw size={15} /></button>}
    </div> : appeals?.length ? <div className="appeal-queue" data-testid="list-pending-appeals">
      {appeals.map((appeal) => <article className="appeal-review-card" key={appeal.id} data-testid={`card-appeal-${appeal.id}`}>
        <div className="appeal-review-meta"><span>SET BY {appeal.setterName}</span><span>{appeal.reportCount} reports</span><span>{new Date(appeal.submittedAt).toLocaleDateString()}</span></div>
        <div className="appeal-review-clue"><span className="form-index">CLUE</span><h2>{appeal.clue}</h2></div>
        <dl className="appeal-review-details"><div><dt>Answer</dt><dd>{appeal.answer}</dd></div><div><dt>Wordplay note</dt><dd>{appeal.wordplay || 'No wordplay note provided.'}</dd></div></dl>
        <div className="appeal-review-reason"><span className="form-index">SETTER’S APPEAL</span><p>{appeal.reason}</p></div>
        <div className="appeal-review-actions">
          <button className="button button-primary" type="button" data-testid={`button-restore-appeal-${appeal.id}`} disabled={reviewAppeal.isPending} onClick={() => void decide(appeal.id, appeal.slug, 'restore')}>Restore clue <Check size={15} /></button>
          <button className="button button-danger-outline" type="button" data-testid={`button-retire-appeal-${appeal.id}`} disabled={reviewAppeal.isPending} onClick={() => {
            if (window.confirm('Retire this clue? Its solve and rating history will be preserved.')) void decide(appeal.id, appeal.slug, 'retire');
          }}>Retire clue <Trash2 size={15} /></button>
        </div>
      </article>)}
    </div> : <div className="state-panel" data-testid="empty-review-queue"><h2>No pending appeals.</h2><p>New setter appeals will appear here.</p></div>}
  </main><Footer /></>;
}

function useParamsSafe() { return useParams<{ slug: string }>(); }

function DashboardPage() {
  const { data: dashboard, isLoading, isError, refetch } = useGetMyDashboard();
  const { data: profile } = useGetMyProfile();
  const { user } = useUser();
  const cache = useQueryClient();
  const olderActivity = useInfiniteQuery({
    queryKey: ['/api/me/activity', user?.id],
    initialPageParam: 10,
    queryFn: ({ pageParam, signal }) => getMyActivity({ offset: pageParam }, { signal }),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: false,
  });
  const allActivity = [
    ...(dashboard?.recentActivity ?? []),
    ...(olderActivity.data?.pages.flatMap((page) => page.activities) ?? []),
  ];
  const updateProfile = useUpdateMyProfile();
  const [blurb, setBlurb] = useState('');
  const [blurbError, setBlurbError] = useState('');
  const [blurbSaved, setBlurbSaved] = useState(false);
  const [publicId, setPublicId] = useState('');
  const [publicIdError, setPublicIdError] = useState('');
  const [publicIdSaved, setPublicIdSaved] = useState(false);
  useEffect(() => { setBlurb(profile?.blurb ?? ''); }, [profile?.publicId, profile?.blurb]);
  useEffect(() => {
    if (profile) {
      setPublicId(profile.publicId);
      setPublicIdError('');
      setPublicIdSaved(false);
    }
  }, [profile?.publicId]);
  const savePublicId = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPublicIdError('');
    setPublicIdSaved(false);
    const requestedId = publicId.trim();
    const canRestore = profile?.claimedPublicIds.some(
      (claimedId) => claimedId.toLowerCase() === requestedId.toLowerCase(),
    ) ?? false;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,23}$/.test(requestedId) && !canRestore) {
      setPublicIdError('Use 3–24 letters, numbers, underscores, or hyphens.');
      return;
    }
    try {
      const updated = await updateProfile.mutateAsync({ data: { publicId: requestedId } });
      cache.setQueryData(getGetMyProfileQueryKey(), updated);
      setPublicId(updated.publicId);
      await cache.invalidateQueries();
      setPublicIdSaved(true);
    } catch (cause) {
      setPublicIdError(apiErrorMessage(cause, 'Your public ID could not be saved. Please try again.'));
    }
  };
  const saveBlurb = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBlurbError('');
    setBlurbSaved(false);
    try {
      const updated = await updateProfile.mutateAsync({ data: { blurb: blurb.trim() } });
      cache.setQueryData(getGetMyProfileQueryKey(), updated);
      await Promise.all([
        cache.invalidateQueries({ queryKey: getGetMyProfileQueryKey() }),
        cache.invalidateQueries({ queryKey: getListCluesQueryKey() }),
        cache.invalidateQueries({ queryKey: getGetMyDashboardQueryKey() }),
      ]);
      setBlurbSaved(true);
    } catch (cause) {
      setBlurbError(apiErrorMessage(cause, 'Your public blurb could not be saved. Please try again.'));
    }
  };
  return <><Header active="dashboard" /><main className="page-wrap dashboard-page">
    <div className="dash-welcome">
      <div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR LITTLE CORNER</div><h1 className="page-title">Good to see you, {profile?.publicId ?? 'solver'}.</h1><p>Your clues, your solves, your ongoing case for being the clever one.</p></div>
      <Link href="/create" className="button button-primary"><PenLine size={16} /> Set a new clue</Link>
    </div>
    {isLoading ? <DashboardSkeleton /> : isError || !dashboard ? <div className="state-panel"><h2>Your page is taking a moment.</h2><p>We couldn't fetch your puzzle notes just now.</p><button className="button button-outline" onClick={() => refetch()}>Refresh page <RotateCcw size={15} /></button></div> : <>
      <form className="profile-blurb-form" onSubmit={(event) => void savePublicId(event)} data-testid="form-public-id">
        <div><span className="form-index">YOUR PUBLIC ID</span><h2>Choose how people see you.</h2><p>Your ID appears on your clues and in the leaderboards. Previously used IDs stay yours and can be restored.</p></div>
        <div className="public-id-field">
          <label className="field-label" htmlFor="profile-public-id">Public ID</label>
          <input
            id="profile-public-id"
            data-testid="input-public-id"
            value={publicId}
            onChange={(event) => { setPublicId(event.target.value); setPublicIdError(''); setPublicIdSaved(false); }}
            list="claimed-public-ids"
            minLength={3}
            maxLength={24}
            autoComplete="nickname"
            required
          />
          <datalist id="claimed-public-ids">
            {profile?.claimedPublicIds.map((claimedId) => <option key={claimedId} value={claimedId} />)}
          </datalist>
          <p className="field-hint">3–24 letters, numbers, underscores, or hyphens. Matching ignores capitalization.</p>
          {publicIdError && <div className="form-error" role="alert" data-testid="status-public-id-error"><X size={16} />{publicIdError}</div>}
          {publicIdSaved && <p className="save-confirmation" role="status" data-testid="status-public-id-saved"><Check size={15} /> Your public ID has been updated.</p>}
          <button className="button button-outline" type="submit" data-testid="button-save-public-id" disabled={updateProfile.isPending}>
            {updateProfile.isPending ? 'Saving…' : 'Save public ID'} <ArrowRight size={15} />
          </button>
        </div>
      </form>
      <form className="profile-blurb-form" onSubmit={(event) => void saveBlurb(event)} data-testid="form-public-blurb">
        <div><span className="form-index">YOUR PUBLIC PROFILE</span><h2>A few words about your setter style.</h2><p>This short note appears beside your clues for everyone to see.</p></div>
        <div className="blurb-field"><label className="field-label" htmlFor="profile-blurb">Public blurb <span className="optional-label">UP TO 280 CHARACTERS</span></label><textarea id="profile-blurb" data-testid="input-public-blurb" value={blurb} onChange={(event) => { setBlurb(event.target.value); setBlurbSaved(false); }} maxLength={280} rows={3} placeholder="A little about the kind of clues you like to write…" /><div className="field-hint"><span>Keep it friendly and puzzle-focused.</span><span>{blurb.length}/280</span></div>
          {blurbError && <div className="form-error" role="alert" data-testid="status-blurb-error"><X size={16} />{blurbError}</div>}
          {blurbSaved && <p className="save-confirmation" role="status" data-testid="status-blurb-saved"><Check size={15} /> Your blurb is up to date.</p>}
          <button className="button button-outline" type="submit" data-testid="button-save-blurb" disabled={updateProfile.isPending}>{updateProfile.isPending ? 'Saving…' : 'Save public blurb'} <ArrowRight size={15} /></button>
        </div>
      </form>
      <div className="stats-strip">
        <div className="stat-block"><span className="stat-label">CLUES SET</span><strong data-testid="text-created-count">{dashboard.created}</strong><span className="stat-caption">little mysteries released</span></div>
        <div className="stat-block stat-highlight"><span className="stat-label">CLUES SOLVED</span><strong data-testid="text-solved-count">{dashboard.solved}</strong><span className="stat-caption">answers found out there</span></div>
        <div className="stat-aside"><span className="stat-doodle"><Sparkles size={24} /></span><p>Keep the clues coming.<br />Your friends are warming up.</p></div>
      </div>
      <div className="dash-section-heading activity-section-heading">
        <div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR SOLVING NOTEBOOK</div><h2 className="section-title">Pick up where you left off</h2></div>
        <Link href="/" className="text-link">Find another clue <ArrowRight size={15} /></Link>
      </div>
      {dashboard.recentActivity.length ? <div className="activity-grid" data-testid="list-solver-activity">
        {allActivity.map((activity) => <ActivityCard key={activity.id} activity={activity} />)}
      </div> : <div className="activity-empty" data-testid="empty-solver-activity">
        <Feather size={19} /><span>No clues started yet. Browse the board and find one to solve.</span><Link href="/" className="text-link">Browse clues <ArrowRight size={15} /></Link>
      </div>}
      {dashboard.hasMoreActivity && (!olderActivity.data || olderActivity.hasNextPage) && <div className="activity-load-more">
        {olderActivity.isFetchNextPageError && <span className="activity-load-error" role="alert">Older activity could not be loaded. Try again.</span>}
        <button
          className="button button-outline"
          type="button"
          data-testid="button-load-older-activity"
          disabled={olderActivity.isFetchingNextPage}
          onClick={() => void olderActivity.fetchNextPage()}
        >
          {olderActivity.isFetchingNextPage ? 'Loading older activity…' : olderActivity.isFetchNextPageError ? 'Try again' : 'Load older activity'} <ArrowDownRight size={15} />
        </button>
      </div>}
      <div className="dash-section-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR RECENT CLUES</div><h2 className="section-title">The ones you put out there</h2></div><Link href="/" className="text-link">Browse the whole board <ArrowRight size={15} /></Link></div>
      {dashboard.recentClues.length ? <div className="clue-grid dashboard-grid">{dashboard.recentClues.map((clue, index) => <ClueCard key={clue.id} clue={clue} index={index} />)}</div> : <div className="empty-clues dash-empty"><div className="empty-stamp"><Feather size={27} /></div><div><h3>Your setter's notebook is blank.</h3><p>Write a clue, then see who can crack it.</p></div><Link href="/create" className="button button-primary">Write your first clue <ArrowRight size={15} /></Link></div>}
      <div className="dash-note"><span><Sparkles size={17} /></span><p>Every new clue starts its own race. Share the link and let the solving begin.</p><Link href="/create">Make another <ArrowUpRight size={15} /></Link></div>
      <div className="reviewer-link-wrap"><Link href="/review" className="text-link" data-testid="link-review-appeals">Open the reviewer queue <ArrowRight size={15} /></Link></div>
    </>}
    {profile && <AccountDeletionPanel publicId={profile.publicId} />}
  </main><Footer /></>;
}

function AccountDeletionPanel({ publicId }: { publicId: string }) {
  const { signOut } = useClerk();
  const cache = useQueryClient();
  const deleteMyAccount = useDeleteMyAccount();
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const matchesPublicId = confirmation.trim().toLowerCase() === publicId.toLowerCase();

  const cancel = () => {
    setIsConfirming(false);
    setConfirmation('');
    setError('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!matchesPublicId) return;
    setError('');
    try {
      await deleteMyAccount.mutateAsync({ data: { confirmationPublicId: confirmation.trim() } });
      cache.clear();
      try {
        await signOut({ redirectUrl: basePath || '/' });
      } catch {
        window.location.replace(basePath || '/');
      }
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Your account could not be deleted. Your public ID and history are unchanged.'));
    }
  };

  return <section className="account-delete-zone" aria-labelledby="account-delete-title" data-testid="panel-delete-account">
    <div className="account-delete-header">
      <div>
        <span className="form-index">ACCOUNT CONTROL</span>
        <h2 id="account-delete-title">Delete your account</h2>
        <p>
          Your sign-in and private sign-in details will be permanently deleted, and your public blurb will be cleared.
          Published clues, ratings, solves, and leaderboard history will remain under <strong>{publicId}</strong>.
          This public ID will stay reserved and cannot be reused. This action cannot be undone.
        </p>
      </div>
      {!isConfirming && <button
        className="button button-danger-outline"
        type="button"
        data-testid="button-open-delete-account"
        onClick={() => { setIsConfirming(true); setError(''); }}
      >
        <Trash2 size={15} /> Delete account
      </button>}
    </div>
    {isConfirming && <form className="account-delete-confirmation" onSubmit={(event) => void submit(event)}>
      <label className="field-label" htmlFor="account-delete-public-id">
        Type <strong>{publicId}</strong> to confirm
      </label>
      <input
        id="account-delete-public-id"
        className="account-delete-input"
        type="text"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={confirmation}
        onChange={(event) => { setConfirmation(event.target.value); setError(''); }}
        aria-describedby="account-delete-hint"
        data-testid="input-delete-account-confirmation"
      />
      <p id="account-delete-hint" className="field-hint">Matching ignores capitalization. Your clues and scores will remain visible under this ID.</p>
      {error && <div className="form-error" role="alert" data-testid="status-delete-account-error"><X size={16} />{error}</div>}
      <div className="account-delete-actions">
        <button className="button button-outline" type="button" onClick={cancel} disabled={deleteMyAccount.isPending}>Cancel</button>
        <button
          className="button button-danger-outline"
          type="submit"
          data-testid="button-confirm-delete-account"
          disabled={!matchesPublicId || deleteMyAccount.isPending}
        >
          <Trash2 size={15} /> {deleteMyAccount.isPending ? 'Deleting account…' : 'Permanently delete account'}
        </button>
      </div>
    </form>}
  </section>;
}

function apiErrorMessage(cause: unknown, fallback: string) {
  if (cause && typeof cause === 'object') {
    const candidate = cause as { message?: unknown; data?: unknown; response?: { data?: unknown }; error?: unknown };
    const nested = candidate.data ?? candidate.response?.data ?? candidate.error;
    if (nested && typeof nested === 'object') {
      const record = nested as { error?: unknown; message?: unknown; detail?: unknown; issues?: unknown; errors?: unknown };
      if (typeof record.error === 'string') return record.error;
      if (typeof record.message === 'string') return record.message;
      if (typeof record.detail === 'string') return record.detail;
      if (Array.isArray(record.issues)) return record.issues.map((issue) => typeof issue === 'string' ? issue : JSON.stringify(issue)).join(' ');
      if (record.errors && typeof record.errors === 'object') return Object.entries(record.errors as Record<string, unknown>).map(([field, issues]) => `${field}: ${Array.isArray(issues) ? issues.join(', ') : String(issues)}`).join(' · ');
    }
    if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message;
  }
  return fallback;
}

function hasHttpStatus(cause: unknown, status: number) {
  return Boolean(
    cause &&
    typeof cause === 'object' &&
    'status' in cause &&
    (cause as { status?: unknown }).status === status,
  );
}

function ActivityCard({ activity }: { activity: SolverActivity }) {
  const stateLabel = activity.state === 'solved' ? 'Solved' : activity.state === 'failed' ? 'Out of guesses' : 'In progress';
  return <Link href={`/clue/${activity.slug}`} className="activity-card" data-testid={`link-solver-activity-${activity.id}`}>
    <div className="activity-card-top">
      <span className={`activity-state activity-state-${activity.state}`}>{stateLabel}</span>
      <ArrowUpRight size={17} aria-hidden="true" />
    </div>
    <h3>{activity.clue}</h3>
    <p className="activity-setter">Set by {activity.setterName}</p>
    <div className="activity-card-bottom">
      <span>{activity.attemptsUsed} of {activity.maxAttempts} {activity.maxAttempts === 1 ? 'guess' : 'guesses'}</span>
      <span>{formatTime(activity.elapsedSeconds)}</span>
    </div>
  </Link>;
}

function Footer() {
  return <footer className="site-footer"><div className="page-wrap footer-inner"><Brand /><span>Made for people who like to think sideways.</span><span className="footer-edition">A FRIENDLY WORD GAME · EST. TODAY</span></div></footer>;
}

function ClueSkeletons() {
  return <div className="clue-grid" aria-label="Loading clues">{[0, 1, 2].map((n) => <div className="skeleton clue-skeleton" key={n}><i /><i /><i /><i /></div>)}</div>;
}
function PageSkeleton() {
  return <main className="min-h-[100dvh] bg-paper px-6 py-10"><div className="page-wrap"><div className="skeleton skeleton-head" /><div className="skeleton skeleton-hero" /><div className="skeleton skeleton-row" /></div></main>;
}
function ChallengeSkeleton() {
  return <div className="challenge-layout"><div className="skeleton challenge-loading" /><div className="skeleton leaderboard-loading" /></div>;
}
function LeaderboardSkeleton() {
  return <div className="leader-skeleton">{[0, 1, 2].map((n) => <div className="skeleton" key={n} />)}</div>;
}
function DashboardSkeleton() {
  return <><div className="skeleton skeleton-row" /><div className="clue-grid mt-10"><div className="skeleton clue-skeleton" /><div className="skeleton clue-skeleton" /></div></>;
}
function formatTime(seconds: number) {
  const safe = Math.max(0, seconds || 0);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export default App;
