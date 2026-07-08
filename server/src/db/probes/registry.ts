import { longTxnProbe } from "./longTxnProbe.js";
import type { DbProbe } from "./types.js";

export const dbProbes: readonly DbProbe[] = [longTxnProbe];
