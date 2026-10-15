/** How long a caller's key is held on an Atom-served deduction, at the Atom and at the API alike. */
export const ATOM_IDEMPOTENCY_TTL_MS = 90 * 60 * 1000;

/** On a request the Atom forwards to the API, the reason it forwarded: the API claims that request's key for the Atom's TTL. */
export const ATOM_FORWARDED_REQUEST_HEADER = "x-atom-forwarded-by";
