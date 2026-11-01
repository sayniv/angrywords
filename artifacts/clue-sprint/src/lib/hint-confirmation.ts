export async function confirmHintReveal<T>(
  confirm: () => boolean,
  reveal: () => Promise<T>,
): Promise<T | undefined> {
  if (!confirm()) return undefined;
  return reveal();
}
