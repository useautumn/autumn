import { seconds } from "@autumn/shared";

export const FULL_SUBJECT_CACHE_TTL_SECONDS = seconds.days(3);
export const FULL_SUBJECT_EPOCH_TTL_SECONDS = seconds.days(5);
export const AGGREGATED_BALANCE_FIELD = "_aggregated";
// Customer-scoped usage-window counters for the capped feature, stored as a
// reserved field in that feature's balance hash (JSON array of rows). The
// rebuild writes it (even []) for armed caps; readers fail OPEN on a missing
// field (the window restarts), so it is a warm-read optimization, not a
// correctness contract.
export const USAGE_WINDOWS_FIELD = "_usage_windows";
