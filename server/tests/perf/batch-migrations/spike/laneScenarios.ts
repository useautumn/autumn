import { TestFeature } from "@tests/setup/v2Features";
import {
	BENCH_PLANDEL_PREFIXES,
	BENCH_PLANREP_PREFIXES,
	type BenchPlanItemPrefixes,
} from "../utils/seedBenchPlanItems.js";

export type LaneScenarioName = "remove" | "replace";

export type LaneScenario = {
	name: LaneScenarioName;
	prefixes: BenchPlanItemPrefixes;
	migrationId: string;
	fromAllowance: number;
	toAllowance: number;
	startingBalance: number;
	tracksSampledCustomers: boolean;
	customerOperation: Record<string, unknown>;
};

export const UNRELATED_PREFIXES: BenchPlanItemPrefixes = {
	productId: "bench-plan-unrelated",
	customerId: "bench-planunr-c-",
	internalCustomer: "cus_bench_planunr_",
	customerProduct: "cp_bench_planunr_",
	entitlement: "ce_bench_planunr_",
};

export const UNRELATED_BALANCE = 1_000_000_000;

const REMOVE: LaneScenario = {
	name: "remove",
	prefixes: BENCH_PLANDEL_PREFIXES,
	migrationId: "bench-mig-lane-remove",
	fromAllowance: 100,
	toAllowance: 0,
	startingBalance: 100,
	tracksSampledCustomers: false,
	customerOperation: {
		type: "update_plan",
		plan_filter: { plan_id: BENCH_PLANDEL_PREFIXES.productId, custom: false },
		customize: { remove_items: [{ feature_id: TestFeature.Messages }] },
	},
};

const REPLACE: LaneScenario = {
	name: "replace",
	prefixes: BENCH_PLANREP_PREFIXES,
	migrationId: "bench-mig-lane-replace",
	fromAllowance: 100,
	toAllowance: 200,
	startingBalance: 10_000,
	tracksSampledCustomers: true,
	customerOperation: {
		type: "update_plan",
		plan_filter: { plan_id: BENCH_PLANREP_PREFIXES.productId, custom: false },
		customize: {
			add_items: [
				{
					feature_id: TestFeature.Messages,
					included: 200,
					reset: { interval: "month" },
				},
			],
			remove_items: [{ feature_id: TestFeature.Messages }],
		},
	},
};

export const laneScenarioOf = ({ name }: { name: string }): LaneScenario => {
	if (name === "remove") return REMOVE;
	if (name === "replace") return REPLACE;
	throw new Error(`Unknown lane scenario ${name}`);
};
