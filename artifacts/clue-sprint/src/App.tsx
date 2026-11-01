import { type ReactNode, type FormEvent, useState, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ClerkProvider, SignIn, SignUp, useClerk, useUser,
} from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Check, Clock3, Copy,
  Crown, Feather, Lightbulb, LockKeyhole, Menu, PenLine, RotateCcw, Sparkles,
  Trophy, X,
} from 'lucide-react';
import {
  getGetClueLeaderboardQueryKey, getGetClueQueryKey, getGetMyDashboardQueryKey,
  getListCluesQueryKey, useCreateClue, useGetClue, useGetClueLeaderboard,
  useGetMyDashboard, useListClues, useStartClue, useSubmitAttempt,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
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
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/create" component={CreateGate} />
        <Route path="/clue/:slug" component={ChallengePage} />
        <Route path="/dashboard" component={DashboardGate} />
        <Route component={NotFound} />
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
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <PageSkeleton />;
  return isSignedIn ? <Redirect to="/dashboard" /> : <HomePage />;
}

function Protected({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <PageSkeleton />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <>{children}</>;
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

function Header({ active = 'browse' }: { active?: 'browse' | 'dashboard' }) {
  const { isSignedIn } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut } = useClerk();
  return (
    <header className="site-header">
      <div className="page-wrap flex h-[76px] items-center justify-between">
        <Brand />
        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/" className={`nav-link ${active === 'browse' ? 'nav-active' : ''}`}>Explore clues</Link>
          {isSignedIn && <Link href="/dashboard" className={`nav-link ${active === 'dashboard' ? 'nav-active' : ''}`}>My page</Link>}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          {isSignedIn ? (
            <>
              <Link href="/create" className="button button-primary button-small"><PenLine size={15} /> Set a clue</Link>
              <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={() => signOut({ redirectUrl: basePath || '/' })}><LockKeyhole size={17} /></button>
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
        {isSignedIn && <Link href="/dashboard" className="nav-link" onClick={() => setMobileOpen(false)}>My page</Link>}
        {isSignedIn ? <Link href="/create" className="button button-primary" onClick={() => setMobileOpen(false)}>Set a clue <PenLine size={15} /></Link> : <Link href="/sign-in" className="button button-primary" onClick={() => setMobileOpen(false)}>Sign in <ArrowRight size={15} /></Link>}
      </div>}
    </header>
  );
}

function HomePage() {
  const { data: clues, isLoading, isError, refetch } = useListClues();
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
              <p className="section-aside">A clue is a tiny mystery.<br />Pick one and have a go.</p>
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

function ClueCard({ clue, index }: { clue: { id: number; slug: string; clue: string; answerLength: number; maxAttempts: number; setterName: string; solveCount: number }; index: number }) {
  return (
    <Link href={`/clue/${clue.slug}`} className={`clue-card reveal-up clue-card-${index % 3}`} data-testid={`card-clue-${clue.id}`}>
      <div className="card-meta"><span className="clue-number">CLUE NO. {String(clue.id).padStart(3, '0')}</span><span className="card-arrow"><ArrowUpRight size={17} /></span></div>
      <p className="card-clue-text">{clue.clue}</p>
      <div className="answer-slots">{Array.from({ length: Math.min(clue.answerLength, 12) }, (_, i) => <i key={i} />)}<span>{clue.answerLength} letters</span></div>
      <div className="card-footer"><span>by <strong>{clue.setterName}</strong></span><span className="solve-count"><Trophy size={14} /> {clue.solveCount} solved</span></div>
    </Link>
  );
}

function Step({ number, icon, title, text }: { number: string; icon: ReactNode; title: string; text: string }) {
  return <div className="how-step"><div className="step-icon">{icon}</div><span className="step-number">{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>;
}

function CreatePage() {
  const [, setLocation] = useLocation();
  const cache = useQueryClient();
  const { user } = useUser();
  const createClue = useCreateClue();
  const [clue, setClue] = useState('');
  const [answer, setAnswer] = useState('');
  const [wordplay, setWordplay] = useState('');
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [error, setError] = useState('');
  const normalizedAnswer = answer.trim().replace(/[^a-z0-9]/gi, '');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (clue.trim().length < 4) { setError('A clue needs at least four characters.'); return; }
    if (!normalizedAnswer) { setError('Add the answer so the sprint can check guesses.'); return; }
    if (!wordplay.trim()) { setError('Add a short explanation so solvers can enjoy the reveal.'); return; }
    try {
      const created = await createClue.mutateAsync({ data: {
        clue: clue.trim(), answer: normalizedAnswer.toUpperCase(),
        wordplay: wordplay.trim(), maxAttempts,
         displayName: user?.fullName || user?.username || 'Setter',
      } });
      await Promise.all([
        cache.invalidateQueries({ queryKey: getListCluesQueryKey() }),
        cache.invalidateQueries({ queryKey: getGetMyDashboardQueryKey() }),
      ]);
      setLocation(`/clue/${created.slug}`);
    } catch {
      setError('That clue did not make it through. Check your connection and try again.');
    }
  };
  return <><Header /><main className="page-wrap page-content">
    <Link href="/dashboard" className="back-link"><ArrowLeft size={15} /> My page</Link>
    <div className="form-layout">
      <div className="form-intro"><div className="eyebrow"><span className="eyebrow-dot" /> SETTER'S DESK</div><h1 className="page-title">Make them<br /><em>think twice.</em></h1><p>Write the clue your friends will be turning over in their heads all afternoon.</p>
        <div className="setter-note"><Lightbulb size={17} /><p><strong>A setter's secret</strong><br />A fair clue has a definition and a bit of wordplay. Keep your explanation close; the big reveal comes after the solve.</p></div>
      </div>
      <form className="paper-form" onSubmit={submit}>
        <div className="form-heading"><span className="form-index">01 / THE CLUE</span><h2>What will they solve?</h2></div>
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
        {error && <div className="form-error" role="alert"><X size={16} />{error}</div>}
        <button className="button button-primary publish-button" type="submit" data-testid="button-publish" disabled={createClue.isPending}>
          {createClue.isPending ? 'Setting your clue…' : 'Publish the clue'} {createClue.isPending ? <span className="button-dots">···</span> : <ArrowRight size={17} />}
        </button>
        <p className="form-footnote">Your friends can solve it as soon as it's published.</p>
      </form>
    </div>
  </main><Footer /></>;
}

function ChallengePage() {
  const params = useParamsSafe();
  const slug = params.slug || '';
  const { data: clue, isLoading, isError, refetch } = useGetClue(slug);
  const { data: leaderboard, isLoading: leaderboardLoading, isError: leaderboardError, refetch: refetchLeaderboard } =
    useGetClueLeaderboard(slug, { query: { queryKey: getGetClueLeaderboardQueryKey(slug), staleTime: 15_000, refetchOnMount: 'always' } });
  const submitAttempt = useSubmitAttempt();
  const startClue = useStartClue();
  const cache = useQueryClient();
  const { isLoaded: authLoaded, isSignedIn, user } = useUser();
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<import('@workspace/api-client-react').AttemptResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [localElapsed, setLocalElapsed] = useState(0);
  const startRequested = useRef(false);
  useEffect(() => {
    setResult(null);
    setAnswer('');
    setCopied(false);
    startRequested.current = false;
  }, [slug]);
  useEffect(() => {
    if (!authLoaded || !isSignedIn || !clue || clue.isOwner || clue.userCompleted || startRequested.current) return;
    startRequested.current = true;
    void startClue.mutateAsync({ slug })
      .then(() => cache.invalidateQueries({ queryKey: getGetClueQueryKey(slug) }))
      .catch(() => { startRequested.current = false; });
  }, [authLoaded, isSignedIn, clue?.id, clue?.isOwner, clue?.userCompleted, slug, startClue.mutateAsync, cache]);
  const persistedStart = startClue.data?.startedAt || clue?.userStartedAt;
  const startedAt = persistedStart ? new Date(persistedStart).getTime() : null;
  useEffect(() => {
    if (result?.completed || clue?.userCompleted || !startedAt) {
      setLocalElapsed(clue?.userElapsedSeconds ?? 0);
      return;
    }
    const updateTimer = () => setLocalElapsed(Math.floor((Date.now() - startedAt) / 1000));
    updateTimer();
    const timer = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, result?.completed, clue?.userCompleted, clue?.userElapsedSeconds]);
  const savedResult = clue && clue.userAttemptsUsed !== null && clue.userAttemptsUsed > 0
    ? {
        correct: Boolean(clue.userSolved),
        attemptsUsed: clue.userAttemptsUsed,
        attemptsRemaining: Math.max(0, clue.maxAttempts - clue.userAttemptsUsed),
        completed: Boolean(clue.userCompleted),
        elapsedSeconds: clue.userElapsedSeconds ?? 0,
        message: clue.userCompleted
          ? clue.userSolved ? 'You already solved this clue.' : 'No attempts remain for this clue.'
          : 'Your progress is saved. Keep going.',
      }
    : null;
  const visibleResult = result ?? savedResult;
  const copyChallengeLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!answer.trim() || !clue) return;
    try {
      const next = await submitAttempt.mutateAsync({
        slug,
        data: { answer: answer.trim(), displayName: user?.fullName || user?.username || 'Solver' },
      });
      setResult(next);
      setAnswer('');
      await Promise.all([
        cache.invalidateQueries({ queryKey: getGetClueLeaderboardQueryKey(slug) }),
        cache.invalidateQueries({ queryKey: getGetClueQueryKey(slug) }),
        cache.invalidateQueries({ queryKey: getGetMyDashboardQueryKey() }),
      ]);
    } catch {
      setResult({ correct: false, attemptsUsed: result?.attemptsUsed || 0, attemptsRemaining: result?.attemptsRemaining ?? clue.maxAttempts, completed: false, elapsedSeconds: 0, message: 'Your guess could not be sent. Please try again.' });
    }
  };
  return <><Header /><main className="page-wrap challenge-page">
    <Link href="/" className="back-link"><ArrowLeft size={15} /> All clues</Link>
    {isLoading ? <ChallengeSkeleton /> : isError || !clue ? <div className="state-panel"><h2>This clue has slipped away.</h2><p>It may have been moved, or the link may be mistyped.</p><button className="button button-outline" onClick={() => refetch()}>Try again <RotateCcw size={15} /></button></div> :
      <div className="challenge-layout">
        <section className="challenge-main">
          <div className="challenge-overline"><span className="eyebrow-dot" /> A CLUE FROM {clue.setterName.toUpperCase()}<span className="challenge-date">{new Date(clue.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><button className="share-link-button" onClick={copyChallengeLink} type="button"><Copy size={13} /> {copied ? 'Link copied' : 'Copy challenge link'}</button></div>
          <div className="challenge-paper">
            <div className="challenge-paper-top"><span>THE DAILY TICKLE</span><span>NO. {String(clue.id).padStart(3, '0')}</span></div>
            <h1 className="challenge-clue" data-testid="text-challenge-clue">{clue.clue}</h1>
            <div className="answer-slots challenge-slots">{Array.from({ length: Math.min(clue.answerLength, 14) }, (_, i) => <i key={i} />)}<span>{clue.answerLength} letters</span></div>
            <div className="challenge-paper-bottom"><span>SET BY <strong>{clue.setterName}</strong></span><span>CRYPTIC / {clue.answerLength}</span></div>
          </div>
          {clue.isOwner && clue.wordplay && <div className="owner-note"><Lightbulb size={17} /><div><strong>Your setter's note</strong><p>{clue.wordplay}</p></div></div>}
          {clue.isOwner ? (
            <div className="owner-note"><Lightbulb size={17} /><div><strong>Your clue is live</strong><p>The answer is <b>{clue.revealedAnswer}</b>. Share the challenge link and see who solves it fastest.</p></div></div>
          ) : !isSignedIn ? (
            <div className="guess-panel"><div className="guess-top"><div><span className="form-index">READY WHEN YOU ARE</span><h2>Join the race</h2></div><div className="timer-chip"><Clock3 size={14} /> {formatTime(0)}</div></div><p className="board-subtitle">Sign in to start your timer and save your attempts across devices.</p><Link href={`/sign-in?next=${encodeURIComponent(window.location.pathname)}`} className="button button-primary">Sign in to solve <ArrowRight size={16} /></Link></div>
          ) : startClue.isError ? (
            <div className="guess-panel"><div className="form-error" role="alert">Your timer could not start. Try again.</div><button className="button button-outline mt-4" onClick={() => { startRequested.current = false; startClue.mutate({ slug }); }}>Start the timer <RotateCcw size={15} /></button></div>
          ) : visibleResult?.completed ? (
            <div className="solved-panel">
              <div className="solved-burst"><Trophy size={25} /></div><span className="form-index">AHA MOMENT</span>
              <h2>{visibleResult.correct ? 'You cracked it.' : 'The answer is revealed.'}</h2>
              <p>{visibleResult.message || (visibleResult.correct ? `Solved in ${formatTime(visibleResult.elapsedSeconds)}.` : 'The clue got the better of this round. There is always the next one.')}</p>
              <div className="solved-word">{clue.revealedAnswer || 'SPRINT COMPLETE'} <span>{visibleResult.attemptsUsed} {visibleResult.attemptsUsed === 1 ? 'guess' : 'guesses'}</span></div>
              {clue.wordplay && <div className="reveal-note"><Lightbulb size={16} /><div><strong>Setter's explanation</strong><p>{clue.wordplay}</p></div></div>}
            </div>
          ) : (
            <form className="guess-panel" onSubmit={handleSubmit}>
              <div className="guess-top"><div><span className="form-index">YOUR TURN</span><h2>What's your answer?</h2></div><div className="timer-chip"><Clock3 size={14} /> {formatTime(localElapsed)}</div></div>
              <div className="guess-entry"><input data-testid="input-guess" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your guess…" autoComplete="off" aria-label="Your answer guess" /><button className="button button-primary" type="submit" data-testid="button-submit-guess" disabled={submitAttempt.isPending || !answer.trim()}>Guess it <ArrowRight size={16} /></button></div>
              <div className="guess-bottom"><div className="attempt-dots">{Array.from({ length: clue.maxAttempts }, (_, i) => <i className={i < (visibleResult?.attemptsUsed || 0) ? 'attempt-used' : ''} key={i} />)}</div><span>{visibleResult ? `${visibleResult.attemptsRemaining} ${visibleResult.attemptsRemaining === 1 ? 'guess' : 'guesses'} left` : `${clue.maxAttempts} guesses to crack it`}</span></div>
              {visibleResult && <div className={`attempt-result ${visibleResult.correct ? 'result-correct' : 'result-wrong'}`} role="status"><span>{visibleResult.correct ? <Check size={17} /> : <X size={17} />}</span><div><strong>{visibleResult.message || (visibleResult.correct ? 'That’s the one!' : 'Not quite. Keep turning it over.')}</strong>{visibleResult.correct && <p>You got it in {formatTime(visibleResult.elapsedSeconds)}. Your time is on the board.</p>}</div></div>}
            </form>
          )}
        </section>
        <aside className="challenge-aside">
          <div className="board-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> THE RACE SO FAR</div><h2>Fastest solves</h2></div><Trophy size={22} /></div>
          <p className="board-subtitle">Every clue gets its own little hall of fame.</p>
          {leaderboardLoading ? <LeaderboardSkeleton /> : leaderboardError ? <div className="board-empty"><p>Could not load the board just now.</p><button className="text-button" onClick={() => refetchLeaderboard()}>Try again</button></div> : leaderboard?.length ? (
            <ol className="leaderboard" data-testid="list-leaderboard">{leaderboard.map((entry) => <li className={`leader-row ${entry.rank === 1 ? 'leader-first' : ''}`} key={`${entry.rank}-${entry.displayName}-${entry.solvedAt}`} data-testid={`row-leader-${entry.rank}`}>
              <span className={`rank-badge rank-${entry.rank}`}>{entry.rank === 1 ? <Crown size={15} /> : String(entry.rank).padStart(2, '0')}</span>
              <div className="leader-person"><strong>{entry.displayName}</strong><span>{entry.attemptsUsed} {entry.attemptsUsed === 1 ? 'guess' : 'guesses'}</span></div>
              <span className="leader-time">{formatTime(entry.elapsedSeconds)}</span>
            </li>)}</ol>
          ) : <div className="board-empty"><div className="empty-medal"><Trophy size={20} /></div><strong>It's a clean slate.</strong><p>Be the first name on this board.</p></div>}
              <div className="board-footnote"><span className="board-star"><Sparkles size={18} /></span><span>Fastest time wins.<br />Fewest guesses is a fine flex, too.</span></div>
          <Link href="/" className="board-browse">Browse another clue <ArrowRight size={15} /></Link>
        </aside>
      </div>
    }
  </main><Footer /></>;
}

function useParamsSafe() { return useParams<{ slug: string }>(); }

function DashboardPage() {
  const { data: dashboard, isLoading, isError, refetch } = useGetMyDashboard();
  const { user } = useUser();
  return <><Header active="dashboard" /><main className="page-wrap dashboard-page">
    <div className="dash-welcome">
      <div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR LITTLE CORNER</div><h1 className="page-title">Good to see you{user?.firstName ? `, ${user.firstName}` : ''}.</h1><p>Your clues, your solves, your ongoing case for being the clever one.</p></div>
      <Link href="/create" className="button button-primary"><PenLine size={16} /> Set a new clue</Link>
    </div>
    {isLoading ? <DashboardSkeleton /> : isError || !dashboard ? <div className="state-panel"><h2>Your page is taking a moment.</h2><p>We couldn't fetch your puzzle notes just now.</p><button className="button button-outline" onClick={() => refetch()}>Refresh page <RotateCcw size={15} /></button></div> : <>
      <div className="stats-strip">
        <div className="stat-block"><span className="stat-label">CLUES SET</span><strong data-testid="text-created-count">{dashboard.created}</strong><span className="stat-caption">little mysteries released</span></div>
        <div className="stat-block stat-highlight"><span className="stat-label">CLUES SOLVED</span><strong data-testid="text-solved-count">{dashboard.solved}</strong><span className="stat-caption">answers found out there</span></div>
        <div className="stat-aside"><span className="stat-doodle"><Sparkles size={24} /></span><p>Keep the clues coming.<br />Your friends are warming up.</p></div>
      </div>
      <div className="dash-section-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR RECENT CLUES</div><h2 className="section-title">The ones you put out there</h2></div><Link href="/" className="text-link">Browse the whole board <ArrowRight size={15} /></Link></div>
      {dashboard.recentClues.length ? <div className="clue-grid dashboard-grid">{dashboard.recentClues.map((clue, index) => <ClueCard key={clue.id} clue={clue} index={index} />)}</div> : <div className="empty-clues dash-empty"><div className="empty-stamp"><Feather size={27} /></div><div><h3>Your setter's notebook is blank.</h3><p>Write a clue, then see who can crack it.</p></div><Link href="/create" className="button button-primary">Write your first clue <ArrowRight size={15} /></Link></div>}
      <div className="dash-note"><span><Sparkles size={17} /></span><p>Every new clue starts its own race. Share the link and let the solving begin.</p><Link href="/create">Make another <ArrowUpRight size={15} /></Link></div>
    </>}
  </main><Footer /></>;
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
