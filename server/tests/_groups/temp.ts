import type { TestGroup } from "./types";

const activeTempPaths: string[] = [
	"integration/billing/migrations-v2/update-plan-operation/feature-quantity-strategy/round-to-lowest-price-topology.test.ts",
	"integration/billing/migrations-v2/update-plan-operation/feature-quantity-strategy/round-to-lowest-price-below-cheapest-tier.test.ts",
	"integration/billing/migrations-v2/update-plan-operation/feature-quantity-strategy/end-to-end-multi-feature-isolation.test.ts",
	"integration/billing/migrations-v2/update-plan-operation/feature-quantity-strategy/base-tier-bump-regression.test.ts",
	"integration/billing/migrations-v2/update-plan-operation/feature-quantity-strategy/round-to-lowest-price-baseline.test.ts",
	"integration/billing/migrations-v2/update-plan-operation/feature-quantity-strategy/end-to-end-multi-entity-schedule-usage.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "This round: FQS update_plan failures after included-filter pairing",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
