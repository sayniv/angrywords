const objectionableWords = [
  "asshole",
  "ass",
  "bastard",
  "bitch",
  "bitchslap",
  "blowjob",
  "bollocks",
  "bullshit",
  "cock",
  "cockhead",
  "cocksucker",
  "crap",
  "cunt",
  "damn",
  "dick",
  "dickhead",
  "dickwad",
  "douche",
  "douchebag",
  "fag",
  "faggot",
  "fuckface",
  "fuck",
  "fuckhead",
  "fuckwit",
  "motherfucker",
  "nigga",
  "nigger",
  "piss",
  "prick",
  "retard",
  "shit",
  "slut",
  "spic",
  "twat",
  "wetback",
  "whore",
  "chink",
  "kike",
  "tranny",
  "porn",
];

const extendableRoots = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "bastard",
  "faggot",
  "nigger",
  "nigga",
  "retard",
  "slut",
  "whore",
  "twat",
  "wetback",
  "tranny",
];

function normalizeForModeration(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7+]/g, "t")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

export function containsObjectionableLanguage(value: string): boolean {
  const normalized = normalizeForModeration(value);
  if (!normalized) return false;
  const words = normalized.split(/\s+/);
  const isBlocked = (word: string) => {
    const collapsed = word.replace(/([a-z])\1+/g, "$1");
    const clamped = word.replace(/([a-z])\1{2,}/g, "$1$1");
    const variants = [word, collapsed, clamped];
    return (
      variants.some((variant) => objectionableWords.includes(variant)) ||
      extendableRoots.some((root) =>
        variants.some(
          (variant) => variant.startsWith(root) && variant.length <= root.length + 5,
        ),
      )
    );
  };
  if (words.some(isBlocked)) return true;
  for (let start = 0; start < words.length; start += 1) {
    for (let length = 3; length <= 12 && start + length <= words.length; length += 1) {
      const sequence = words.slice(start, start + length);
      if (sequence.every((word) => word.length === 1) && isBlocked(sequence.join(""))) {
        return true;
      }
    }
  }
  return false;
}
