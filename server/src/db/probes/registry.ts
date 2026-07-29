import { longTxnProbe } from "./longTxnProbe.js";
import { replicationSlotProbe } from "./replicationSlotProbe.js";
import type { DbProbe } from "./types.js";

export const dbProbes: readonly DbProbe[] = [
	longTxnProbe,
	replicationSlotProbe,
];
