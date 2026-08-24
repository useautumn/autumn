import type { Feature } from "@autumn/shared";

// One feature's share of a command: how much to move, and whose rows move it.
export type DeductionRequest = {
	feature: Feature;
	amount: number;
};
