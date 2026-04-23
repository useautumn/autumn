/**
 * Per-lock claim marker key. Used by the V2 claim path to atomically race
 * finalizers via `SET NX EX` — the receipt key itself stays write-once.
 * `deleteLockReceiptV2` DELs both keys in a single variadic DEL.
 */
export const buildClaimMarkerKey = (lockReceiptKey: string): string =>
	`${lockReceiptKey}:claim`;
