/**
 * Escapes LIKE/ILIKE wildcards so a search for `100%` or `a_b` matches those
 * characters literally. PostgreSQL uses backslash as the default escape
 * character for LIKE patterns.
 */
export function escapeLikePattern(value: string) {
  return value.replaceAll(/[\\%_]/g, (character) => `\\${character}`);
}
