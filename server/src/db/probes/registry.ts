import { longTxnProbe } from "./longTxnProbe.js";
import type { DbProbe } from "./types.js";

/**
 * Every DB health probe run on the cron tick. Add a new check by importing its
 * DbProbe here — it is scheduled and error-isolated automatically.
 */
export const dbProbes: DbProbe[] = [longTxnProbe];
