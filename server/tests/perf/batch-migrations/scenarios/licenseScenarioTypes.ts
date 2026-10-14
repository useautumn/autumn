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

export type ScenarioExpectation = {
	lane: "batch" | "per_customer";
	rejections?: BatchMigrationRejection["code"][];
	rowsPerAssignment?: Record<string, number>;
	balance?: Record<string, number>;
	untouched?: string[];
};

export type LicenseScenario = {
	name: string;
	description: string;
	seat: SeatItemSpec[];
	op: ScenarioOp;
	expect: ScenarioExpectation;
	skip?: string;
};
