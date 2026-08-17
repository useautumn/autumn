import type { BatchMigrationRejection } from "@/internal/migrations/v2/batchOperations/types/index.js";

/** A plan item, in the shapes the migration lanes have to tell apart. */
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

/** Where the change lands: on the plan the customer holds, or on a license plan
 * one of its parents links. The batch lane treats these very differently. */
export type ScenarioTarget = "plan" | "license";

export type ScenarioOp =
	| { verb: "add"; target: ScenarioTarget; item: ItemSpec }
	| { verb: "edit"; target: ScenarioTarget; from: ItemSpec; to: ItemSpec }
	| { verb: "remove"; target: ScenarioTarget; item: ItemSpec };

export type ScenarioExpectation = {
	lane: "batch" | "per_customer";
	rejections?: BatchMigrationRejection["code"][];
	/** Rows carrying this feature, per customer product the op targets. */
	rowsPerTarget?: Record<string, number>;
	/** Balance after the run, per feature. */
	balance?: Record<string, number>;
	/** Features whose entitlement_id and balance must be unchanged. */
	untouched?: string[];
};

export type MigrationScenario = {
	name: string;
	description: string;
	/** Items on the plan the customer holds. */
	planItems: ItemSpec[];
	/** Items on the license plan, when the scenario needs one. */
	licenseItems?: ItemSpec[];
	op: ScenarioOp;
	expect: ScenarioExpectation;
	skip?: string;
};
