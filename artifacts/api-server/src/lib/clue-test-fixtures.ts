import { createHash } from "node:crypto";

export const CLUE_FIXTURE_MARKER = "[CLUE SPRINT TEST FIXTURE]";
export const CLUE_FIXTURE_COUNT = 20;

export interface ClueFixtureDefinition {
  clue: string;
  answer: string;
  wordplay: string;
  maxAttempts: number;
  hints: string[];
}

export const clueFixtureDefinitions: ClueFixtureDefinition[] = [
  {
    clue: "A small insect returns with a note",
    answer: "ANT",
    wordplay: "A short starter clue for testing a three-letter answer.",
    maxAttempts: 3,
    hints: [],
  },
  {
    clue: "A star can guide a sailor home",
    answer: "NORTH",
    wordplay: "The direction associated with the North Star.",
    maxAttempts: 4,
    hints: ["Think of a compass point."],
  },
  {
    clue: "A clever bird keeps a secret",
    answer: "RAVEN",
    wordplay: "A five-letter bird; try a deliberately wrong guess first.",
    maxAttempts: 5,
    hints: ["It is a bird.", "It is often linked with a tower."],
  },
  {
    clue: "Three stages of light make a bright idea",
    answer: "LANTERN",
    wordplay: "A portable light, useful for trying every hint tier.",
    maxAttempts: 6,
    hints: [
      "It is something you can carry.",
      "It gives light when it is dark.",
      "It has seven letters and can hang from a hook.",
    ],
  },
  {
    clue: "A frozen treat takes a turn in the sun",
    answer: "GELATO",
    wordplay: "A six-letter Italian frozen dessert.",
    maxAttempts: 3,
    hints: [],
  },
  {
    clue: "A quiet place for a book and a cup",
    answer: "LIBRARY",
    wordplay: "A place where you can borrow books.",
    maxAttempts: 4,
    hints: ["Look for shelves of books.", "The answer has seven letters."],
  },
  {
    clue: "A planet's ring surrounds a shiny metal",
    answer: "SATURN",
    wordplay: "The ringed planet in our solar system.",
    maxAttempts: 5,
    hints: ["It is a planet.", "It is famous for its rings.", "Its name starts with S."],
  },
  {
    clue: "An early bird catches the morning",
    answer: "DAWN",
    wordplay: "The first light of day.",
    maxAttempts: 3,
    hints: ["It happens before noon."],
  },
  {
    clue: "A place to watch the stars above",
    answer: "OBSERVATORY",
    wordplay: "A building designed for observing the night sky.",
    maxAttempts: 4,
    hints: ["Look up at the night sky.", "It has eleven letters."],
  },
  {
    clue: "A sweet sound from a garden visitor",
    answer: "HUMMINGBIRD",
    wordplay: "A small bird known for hovering and humming.",
    maxAttempts: 6,
    hints: [
      "It is a bird.",
      "It can hover in place.",
      "Its name describes a sound it makes.",
    ],
  },
  {
    clue: "A warm drink after a winter walk",
    answer: "COCOA",
    wordplay: "A five-letter chocolate drink.",
    maxAttempts: 4,
    hints: [],
  },
  {
    clue: "A map-maker's needle points the way",
    answer: "COMPASS",
    wordplay: "A navigational tool with a magnetic needle.",
    maxAttempts: 5,
    hints: ["It helps with directions."],
  },
  {
    clue: "A bright streak races across the night",
    answer: "METEOR",
    wordplay: "A space rock burning through the atmosphere.",
    maxAttempts: 3,
    hints: ["You might make a wish on one.", "It is not a planet."],
  },
  {
    clue: "A tiny seed grows into a shady friend",
    answer: "TREE",
    wordplay: "A plant with a trunk and branches.",
    maxAttempts: 4,
    hints: ["It can provide shade.", "It starts as a seed.", "The answer is four letters."],
  },
  {
    clue: "A playful wave rolls onto the beach",
    answer: "SURF",
    wordplay: "The breaking waves or the sport of riding them.",
    maxAttempts: 5,
    hints: [],
  },
  {
    clue: "A keeper of time has hands but no arms",
    answer: "CLOCK",
    wordplay: "A household object that shows the time.",
    maxAttempts: 3,
    hints: ["It can hang on a wall."],
  },
  {
    clue: "A place where a story finds its ending",
    answer: "BOOKSTORE",
    wordplay: "A shop that sells stories in bound pages.",
    maxAttempts: 6,
    hints: ["It is a shop.", "It sells books.", "The answer has nine letters."],
  },
  {
    clue: "A winter coat for a mountain peak",
    answer: "SNOWCAP",
    wordplay: "The covering that sits on a high mountain in winter.",
    maxAttempts: 4,
    hints: ["It is made of frozen precipitation.", "It is found on a summit."],
  },
  {
    clue: "A note carried on a breeze",
    answer: "MELODY",
    wordplay: "A tune or sequence of musical notes.",
    maxAttempts: 5,
    hints: ["It belongs to music.", "You can hum it."],
  },
  {
    clue: "A night light made by countless distant suns",
    answer: "STARLIGHT",
    wordplay: "Light that reaches us from stars.",
    maxAttempts: 6,
    hints: ["Look up on a clear night.", "It comes from stars.", "The answer has nine letters."],
  },
];

export interface FixtureEnvironment {
  operation: "seed" | "cleanup";
  nodeEnv: string | undefined;
  userId: string | undefined;
  confirmation: string | undefined;
}

export function assertFixtureEnvironment(
  operation: FixtureEnvironment["operation"],
  nodeEnv: FixtureEnvironment["nodeEnv"],
  userId: FixtureEnvironment["userId"],
  confirmation: FixtureEnvironment["confirmation"],
): asserts userId is string {
  if (nodeEnv !== "development" && nodeEnv !== "test") {
    throw new Error("Clue fixtures are allowed only when NODE_ENV is development or test.");
  }
  if (!userId || !/^user_[A-Za-z0-9_-]+$/.test(userId)) {
    throw new Error("Set CLUE_FIXTURE_USER_ID to the ID of an existing Clerk test account.");
  }
  if (confirmation !== `YES_${operation.toUpperCase()}`) {
    throw new Error(`Set CLUE_FIXTURES_CONFIRM=YES_${operation.toUpperCase()} to continue.`);
  }
}

export function getClueFixtureSlugPrefix(userId: string): string {
  return `fx${createHash("sha256").update(userId).digest("hex").slice(0, 10)}`;
}

export function getClueFixtureSlug(userId: string, index: number): string {
  if (!Number.isInteger(index) || index < 1 || index > CLUE_FIXTURE_COUNT) {
    throw new Error(`Fixture index must be between 1 and ${CLUE_FIXTURE_COUNT}.`);
  }
  return `${getClueFixtureSlugPrefix(userId)}${String(index).padStart(2, "0")}`;
}

export interface FixtureProgressDefinition {
  clueIndex: number;
  userId: string;
  displayName: string;
  attemptsUsed: number;
  hintsRevealed: number;
  assistEnabled: boolean;
  startedAt: Date;
  solvedAt: Date | null;
  failedAt: Date | null;
  elapsedSeconds: number | null;
}

export function buildClueFixtureProgress(
  userId: string,
  now: Date,
): FixtureProgressDefinition[] {
  const accountTag = getClueFixtureSlugPrefix(userId);
  const featuredClueIndex = 4;
  const progress: FixtureProgressDefinition[] = [];
  const tiers = [
    { assistEnabled: false, hintsRevealed: 0, times: [82, 119, 164] },
    { assistEnabled: false, hintsRevealed: 1, times: [132, 188, 247] },
    { assistEnabled: true, hintsRevealed: 0, times: [101, 153, 216] },
  ];

  for (const [tierIndex, tier] of tiers.entries()) {
    for (const [rankIndex, elapsedSeconds] of tier.times.entries()) {
      const solvedAt = new Date(now.getTime() - (rankIndex + 1) * 86_400_000 - tierIndex * 3_600_000);
      progress.push({
        clueIndex: featuredClueIndex,
        userId: `clue-fixture-solver-${accountTag}-${String(tierIndex * 3 + rankIndex + 1).padStart(2, "0")}`,
        displayName: `Fixture Solver ${String(tierIndex * 3 + rankIndex + 1).padStart(2, "0")}`,
        attemptsUsed: rankIndex + 1,
        hintsRevealed: tier.hintsRevealed,
        assistEnabled: tier.assistEnabled,
        startedAt: new Date(solvedAt.getTime() - elapsedSeconds * 1_000),
        solvedAt,
        failedAt: null,
        elapsedSeconds,
      });
    }
  }

  const inProgressStartedAt = new Date(now.getTime() - 4 * 60_000);
  progress.push({
    clueIndex: 9,
    userId: `clue-fixture-solver-${accountTag}-in-progress`,
    displayName: "Fixture In-Progress Solver",
    attemptsUsed: 2,
    hintsRevealed: 1,
    assistEnabled: true,
    startedAt: inProgressStartedAt,
    solvedAt: null,
    failedAt: null,
    elapsedSeconds: null,
  });

  const failedAt = new Date(now.getTime() - 2 * 86_400_000);
  progress.push({
    clueIndex: 10,
    userId: `clue-fixture-solver-${accountTag}-failed`,
    displayName: "Fixture Failed Solver",
    attemptsUsed: clueFixtureDefinitions[9]!.maxAttempts,
    hintsRevealed: 2,
    assistEnabled: false,
    startedAt: new Date(failedAt.getTime() - 9 * 60_000),
    solvedAt: null,
    failedAt,
    elapsedSeconds: null,
  });

  return progress;
}
