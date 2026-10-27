// CAP Application ID helpers. The browser may send an ID in any style ("en24 133045", "EN24-133045");
// the server turns it into ONE canonical form before it touches the database.
//
// Canonical form: upper-case letters and digits only, 6 to 20 characters.

export const CAP_ID_PATTERN = /^[A-Z0-9]{6,20}$/;

/** Normalizes user input. Returns '' when nothing usable is left. Never throws. */
export function normalizeCapId(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function isValidCapId(normalized: string): boolean {
  return CAP_ID_PATTERN.test(normalized);
}

/** Normalizes and validates in one step. Returns the canonical ID or null. */
export function parseCapId(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 60) return null;
  const id = normalizeCapId(input);
  return isValidCapId(id) ? id : null;
}

/** Normalizes the admin login ID: trimmed and lower-case. */
export function parseAdminLoginId(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 64) return null;
  const id = input.normalize('NFKC').trim().toLowerCase();
  return /^[a-z0-9._-]{3,32}$/.test(id) ? id : null;
}
