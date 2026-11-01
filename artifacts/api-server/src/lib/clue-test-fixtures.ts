import { createHash } from "node:crypto";

export const CLUE_FIXTURE_MARKER = "[CLUE SPRINT TEST FIXTURE]";
export const CLUE_FIXTURE_COUNT = 100;

export interface ClueFixtureDefinition {
  clue: string;
  answer: string;
  wordplay: string;
  maxAttempts: number;
  hints: string[];
}

const coreClueFixtureDefinitions: ClueFixtureDefinition[] = [
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

const additionalClueSeeds = [
  ["A crisp orchard snack with a shiny skin", "APPLE", "A common fruit that can be red, green, or yellow."],
  ["A striped cat that rules the tall grass", "TIGER", "A large wild cat with dark stripes."],
  ["A bright bloom that follows the sun", "SUNFLOWER", "A tall plant with a large yellow flower head."],
  ["A cold drink with bubbles and a slice of citrus", "LEMONADE", "A sweetened lemon drink often served chilled."],
  ["A little boat with a paddle for two", "KAYAK", "A narrow watercraft propelled with a double-bladed paddle."],
  ["A green jewel hidden in a forest", "EMERALD", "A precious green gemstone."],
  ["A tiny key that opens a musical scale", "CLEF", "A symbol at the beginning of a line of music."],
  ["A tall tower that flashes beside the sea", "LIGHTHOUSE", "A coastal tower that guides ships with a light."],
  ["A soft cloud of wool on a hillside", "SHEEP", "A farm animal raised for wool."],
  ["A frozen river that slowly crosses a valley", "GLACIER", "A large mass of slowly moving ice."],
  ["A ring of stones around a quiet garden", "FENCE", "A barrier that marks the edge of an area."],
  ["A small page marker tucked inside a novel", "BOOKMARK", "An item used to keep your place in a book."],
  ["A little red fruit baked beneath a crust", "CHERRY", "A small fruit with a stone in the middle."],
  ["A desert traveler with a built-in water tank", "CAMEL", "A long-legged mammal adapted to dry regions."],
  ["A silver fish that swims upstream to spawn", "SALMON", "A fish known for migrating from sea to river."],
  ["A round instrument that measures the weather", "BAROMETER", "An instrument used to measure air pressure."],
  ["A curved bridge made by rain and sunlight", "RAINBOW", "A band of colors visible after rain."],
  ["A tiny house carried on a turtle's back", "SHELL", "A hard outer covering that protects some animals."],
  ["A golden grain that pops in a hot pan", "POPCORN", "A snack made by heating dried corn kernels."],
  ["A winter visitor with a carrot for a nose", "SNOWMAN", "A human-shaped figure built from packed snow."],
  ["A hidden path through a field of tall grass", "TRAIL", "A marked route for walking or hiking."],
  ["A metal bird that carries people above clouds", "AIRPLANE", "A powered vehicle designed to fly."],
  ["A little bell that rings when the wind arrives", "CHIME", "A small bell or set of bells that makes a clear sound."],
  ["A bright stone that can scratch glass", "DIAMOND", "A very hard precious gemstone."],
  ["A warm blanket of feathers in the farmyard", "DUCK", "A waterbird with a broad bill and webbed feet."],
  ["A kitchen helper that turns beans into breakfast", "TOASTER", "An appliance used to brown slices of bread."],
  ["A striped candy cane that curls at the top", "PEPPERMINT", "A mint-flavored candy often made in red and white."],
  ["A small room where paintings hang in rows", "GALLERY", "A place where artworks are displayed."],
  ["A wave-shaped mark that means a sound is missing", "TILDE", "A diacritic mark drawn as a short wavy line."],
  ["A pocket-sized light for a dark hallway", "FLASHLIGHT", "A handheld battery-powered light."],
  ["A noisy bird that repeats what it hears", "PARROT", "A colorful bird known for mimicking sounds."],
  ["A place where a river meets the open sea", "DELTA", "A landform built from sediment near a river mouth."],
  ["A little wheel that helps a bicycle turn", "PEDAL", "A foot-operated lever that drives a bicycle."],
  ["A thin sheet that catches the morning breeze", "SAIL", "Fabric that uses wind to move a boat."],
  ["A sweet brown spice rolled into a pastry", "CINNAMON", "A fragrant spice made from tree bark."],
  ["A crown of ice that floats across the ocean", "ICEBERG", "A large floating mass of freshwater ice."],
  ["A bright orange root pulled from the soil", "CARROT", "A crunchy root vegetable rich in orange pigment."],
  ["A tiny star-shaped creature on the seafloor", "STARFISH", "A marine animal with arms radiating from its center."],
  ["A tall glass house for tropical plants", "GREENHOUSE", "A structure that keeps plants warm and protected."],
  ["A soft sound made by a sleeping kitten", "PURR", "A low vibrating sound made by a contented cat."],
  ["A traveler that carries its home in a spiral", "SNAIL", "A slow-moving animal with a coiled shell."],
  ["A paper bird folded from a square", "ORIGAMI", "The Japanese art of folding paper into shapes."],
  ["A bright marker used to underline a sentence", "HIGHLIGHTER", "A fluorescent pen used to emphasize text."],
  ["A mountain path that ends beside a waterfall", "CASCADE", "A small steep waterfall or a series of them."],
  ["A dark red fruit pressed into a summer drink", "CRANBERRY", "A tart red berry often used in juice and sauce."],
  ["A nighttime insect with a glowing tail", "FIREFLY", "A beetle that produces light from its abdomen."],
  ["A round table game played with black and white stones", "GO", "A strategy board game that originated in East Asia."],
  ["A little flag that marks a place on a map", "PIN", "A marker used to identify a location."],
  ["A quiet instrument with strings and a bow", "VIOLIN", "A small high-pitched bowed string instrument."],
  ["A yellow flower that opens on a spring lawn", "DAFFODIL", "A spring-blooming flower with a trumpet-shaped center."],
  ["A cold sweet scoop served in a paper cone", "SORBET", "A frozen dessert made from fruit and sugar."],
  ["A giant mammal with a trunk like a hose", "ELEPHANT", "A large land animal with tusks and a long trunk."],
  ["A spinning toy with a string around its middle", "YOYO", "A toy that travels up and down on a cord."],
  ["A rocky island where seabirds gather", "CLIFF", "A steep rock face, often beside the sea."],
  ["A small tool that tightens a loose screw", "WRENCH", "A hand tool for gripping and turning nuts or bolts."],
  ["A fragrant purple flower in a sunny field", "LAVENDER", "A strongly scented flowering plant with purple blooms."],
  ["A warm loaf with a crust that crackles", "BREAD", "A baked food made from flour and water."],
  ["A bright planet named for the Roman messenger", "MERCURY", "The smallest planet and the closest to the Sun."],
  ["A paper tube that carries a birthday wish", "ENVELOPE", "A folded paper container for a letter."],
  ["A striped shell that washes up on shore", "SEASHELL", "The hard outer covering of a marine mollusk."],
  ["A small brass instrument with three buttons", "TRUMPET", "A high-register brass instrument with valves."],
  ["A place to borrow a hammer for the weekend", "TOOLSHED", "A small building where garden or repair tools are stored."],
  ["A tropical fruit with a spiky crown", "PINEAPPLE", "A sweet tropical fruit with a tough, spiny skin."],
  ["A woven basket that holds a picnic lunch", "HAMPER", "A large basket or container for carrying things."],
  ["A white bird that carries a peace symbol", "DOVE", "A small pigeon-like bird often used as a peace symbol."],
  ["A clear stone that forms in a cave", "CRYSTAL", "A solid material with atoms arranged in an ordered pattern."],
  ["A clockwork toy that marches across the floor", "ROBOT", "A machine that can carry out programmed tasks."],
  ["A curved blade used to harvest tall grass", "SICKLE", "A short-handled tool with a curved cutting blade."],
  ["A small cloud of flour above the baker's table", "DUST", "Fine dry particles that settle on surfaces."],
  ["A paper map folded into a jacket pocket", "ATLAS", "A book or collection of maps."],
  ["A cheerful tune played by a street musician", "JINGLE", "A short, catchy tune or a light ringing sound."],
  ["A deep blue stone set in a silver ring", "SAPPHIRE", "A precious gemstone, commonly blue."],
  ["A fast animal with a spotted coat and long legs", "CHEETAH", "A large cat known as the fastest land animal."],
  ["A small round cake with a candle on top", "CUPCAKE", "An individually portioned cake baked in a cup-shaped mold."],
  ["A neat line of trees beside a country road", "AVENUE", "A broad road, often lined with trees."],
  ["A bright streak left by a skipping stone", "RIPPLE", "A small wave that spreads across a surface."],
  ["A round citrus fruit with a thick dimpled peel", "ORANGE", "A sweet citrus fruit and its familiar color."],
  ["A dark bird that collects shiny things", "MAGPIE", "A black-and-white bird known in folklore for collecting objects."],
  ["A woven cloth that covers a picnic table", "TABLECLOTH", "A fabric covering placed over a table."],
  ["A quiet animal that sleeps through winter", "HEDGEHOG", "A small mammal with spines that may hibernate."],
] as const;

function buildFixtureHints(answer: string, hintCount: number): string[] {
  const hints = [
    `The answer starts with ${answer[0]}.`,
    `The answer has ${answer.length} letters.`,
    `The answer ends with ${answer.at(-1)}.`,
  ];
  return hints.slice(0, hintCount);
}

export const clueFixtureDefinitions: ClueFixtureDefinition[] = [
  ...coreClueFixtureDefinitions,
  ...additionalClueSeeds.map(([clue, answer, wordplay], index) => ({
    clue,
    answer,
    wordplay,
    maxAttempts: 3 + (index % 4),
    hints: buildFixtureHints(answer, index % 4),
  })),
];

export interface FixtureClueCandidate {
  id: number;
  slug: string;
  clue: string;
  setterUserId: string;
}

export function selectManagedClueFixtures(
  candidates: FixtureClueCandidate[],
  userId: string,
): FixtureClueCandidate[] {
  const slugPrefix = getClueFixtureSlugPrefix(userId);
  return candidates.filter(({ setterUserId, slug, clue }) =>
    setterUserId === userId
    && slug.startsWith(slugPrefix)
    && clue.startsWith(CLUE_FIXTURE_MARKER),
  );
}

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
