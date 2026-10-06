/**
 * Summed ms of push work on this thread. parse: reading a push it received (a queue envelope, a catalog body);
 * hopWait: waiting on another thread to apply one; owner: applying one it owns (parse, validate, store); write: the store part.
 */
export const pushPhaseMs = { parse: 0, hopWait: 0, owner: 0, write: 0 };
