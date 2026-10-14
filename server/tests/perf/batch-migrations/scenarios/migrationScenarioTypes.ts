import type { BatchMigrationRejection } from "@/internal/migrations/v2/batchOperations/types/index.js";

export type ItemSpec = {
	featureId: string;
	included?: number;
	interval?: string;
	intervalCount?: number;
	boolean?: boolean;
	unlimited?: boolean;
	priced?: { amount: number; billingUnits: number };
	entityFeatureId?: string;
	rollover?: { max: number };
	pooled?: boolean;
};

export type ScenarioTarget = "plan" | "license";

export type ScenarioOp =
	| { verb: "add"; target: ScenarioTarget; item: ItemSpec }
	| { verb: "edit"; target: ScenarioTarget; from: ItemSpec; to: ItemSpec }
	| { verb: "remove"; target: ScenarioTarget; item: ItemSpec };

export type ScenarioExpectation = {
	lane: "batch" | "per_customer";
	rejections?: BatchMigrationRejection["code"][];
	rowsPerTarget?: Record<string, number>;
	balance?: Record<string, number>;
	untouched?: string[];
};

export type MigrationScenario = {
	name: string;
	description: string;
	planItems: ItemSpec[];
	licenseItems?: ItemSpec[];
	op: ScenarioOp;
	expect: ScenarioExpectation;
	skip?: string;
};
