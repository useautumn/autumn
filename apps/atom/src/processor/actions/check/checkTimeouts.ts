/** The server's shadow Atom timeout (ATOM_SHADOW_TIMEOUT_MS): an answer this late was already a timeout to its caller. */
export const CHECK_TIMEOUT_MS = 300;

/** Checks this thread answered as their owner at least CHECK_TIMEOUT_MS after they reached the Atom, published as deltas. */
export const checkTimeouts = { count: 0 };
