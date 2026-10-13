import { describe, expect, test } from "bun:test";
import {
	type CreditSchemaOverrideItem,
	type Feature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { features } from "@tests/utils/fixtures/db/features";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { deriveCustomerProductIsCustom } from "@/internal/customers/cusProducts/actions/deriveIsCustom/deriveCustomerProductIsCustom";
import {
	allFeatures,
	asCustomRow,
	catalogPlan,
	customerPlan,
	fakeLogger,
	includedItem,
	type PlanItemRows,
} from "./isCustomFixtures";

const action = (id: string) =>
	features.create({
		id,
		name: id,
		config: { usage_type: FeatureUsageType.Single },
	}) as Feature;

const searches = action("searches");
const exports = action("exports");

const creditSystem = features.create({
	id: "ai_credits",
	name: "AI Credits",
	type: FeatureType.CreditSystem,
	config: {
		usage_type: FeatureUsageType.Single,
		schema: [
			{ metered_feature_id: "searches", credit_amount: 1 },
			{ metered_feature_id: "exports", credit_amount: 2 },
		],
	},
}) as Feature;

const creditsItem = (schema?: CreditSchemaOverrideItem[]): PlanItemRows => {
	const item = includedItem({ feature: creditSystem });
	if (schema === undefined) return item;
	return {
		entitlement: { ...item.entitlement, feature_override: { schema } },
	};
};

const deriveOutcome = ({
	catalog,
	customer,
}: {
	catalog: PlanItemRows;
	customer: PlanItemRows;
}) =>
	deriveCustomerProductIsCustom({
		ctx: { logger: fakeLogger() } as unknown as Pick<AutumnContext, "logger">,
		customerProduct: customerPlan({ items: [asCustomRow(customer)] }),
		baseProduct: catalogPlan({ items: [catalog] }),
		features: [...allFeatures, searches, exports, creditSystem],
	}).outcome;

const searchesRate = { metered_feature_id: "searches", credit_amount: 0.5 };
const exportsExcluded = {
	metered_feature_id: "exports",
	excluded: true as const,
};

describe("deriveCustomerProductIsCustom feature_override", () => {
	test("the catalog's override with rows reordered → not custom", () => {
		expect(
			deriveOutcome({
				catalog: creditsItem([searchesRate, exportsExcluded]),
				customer: creditsItem([exportsExcluded, searchesRate]),
			}),
		).toBe("matches_catalog");
	});

	test("an empty override against a catalog with none → not custom", () => {
		expect(
			deriveOutcome({ catalog: creditsItem(), customer: creditsItem([]) }),
		).toBe("matches_catalog");
	});

	test("an exclusion the catalog doesn't have → custom", () => {
		expect(
			deriveOutcome({
				catalog: creditsItem([searchesRate]),
				customer: creditsItem([searchesRate, exportsExcluded]),
			}),
		).toBe("customized");
	});

	test("a row pinning the credit system's own rate → custom", () => {
		expect(
			deriveOutcome({
				catalog: creditsItem(),
				customer: creditsItem([
					{ metered_feature_id: "searches", credit_amount: 1 },
				]),
			}),
		).toBe("customized");
	});
});
