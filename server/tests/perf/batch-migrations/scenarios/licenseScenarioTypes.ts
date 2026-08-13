import type { BatchMigrationRejection } from "@/internal/migrations/v2/batchOperations/types/index.js";

export type SeatItemSpec = {
	featureId: string;
	included?: number;
	interval?: string;
	intervalCount?: number;
	boolean?: boolean;
	priced?: { amount: number; billingUnits: number };
	entityFeatureId?: string;
	rollover?: { max: number };
};

export type ScenarioOp =
	| { verb: "add"; item: SeatItemSpec }
	| { verb: "edit"; from: SeatItemSpec; to: SeatItemSpec }
	| { verb: "remove"; featureId: string; interval?: string };

/** What the run must leave behind. Absent keys are not asserted, so a scenario
 * states only what it is about while the shared invariants still run. */
export type ScenarioExpectation = {
	lane: "batch" | "per_customer";
	rejections?: BatchMigrationRejection["code"][];
	/** Rows carrying this feature, per live assignment. */
	rowsPerAssignment?: Record<string, number>;
	/** Balance after the run, per feature, per live assignment. */
	balance?: Record<string, number>;
	/** Features whose entitlement_id and balance must be unchanged. */
	untouched?: string[];
};

export type LicenseScenario = {
	name: string;
	description: string;
	seat: SeatItemSpec[];
	op: ScenarioOp;
	expect: ScenarioExpectation;
	/** Set when the shape cannot be reached, with the reason. */
	skip?: string;
};
