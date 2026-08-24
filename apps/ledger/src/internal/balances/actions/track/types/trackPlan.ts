import type { BalancePlan } from "../../../types/balancePlan.js";

export type TrackPlan = BalancePlan & {
	// Per feature, what the command could not place — a per-feature reject reads
	// this where `remaining` only says whether anything was left over at all.
	remainingByFeatureId: Record<string, number>;
};
