import { describe, expect, test } from "bun:test";
import type { ExistingRollover } from "@autumn/shared";
import { createMockCusEntitlement } from "@tests/utils/mockUtils/cusEntitlementMocks";
import { createMockCusProduct } from "@tests/utils/mockUtils/cusProductMocks";
import chalk from "chalk";
import { applyExistingRollovers } from "@/internal/billing/billingUtils/handleExistingRollovers/applyExistingRollovers";

describe(chalk.yellowBright("applyExistingRollovers (duplicate internal_feature_id)"), () => {
	test("applies rollover only to first cusEnt when multiple have same internal_feature_id", () => {
		const internalFeatureId = "internal_words";

		const cusEntFirst = createMockCusEntitlement({
			id: "cus_ent_first",
			internalFeatureId,
			featureId: "words",
			featureName: "Words",
			allowance: 100,
			balance: 100,
		});

		const cusEntSecond = createMockCusEntitlement({
			id: "cus_ent_second",
			internalFeatureId,
			featureId: "words",
			featureName: "Words",
			allowance: 200,
			balance: 200,
		});

		const newCusProduct = createMockCusProduct({
			cusEntitlements: [cusEntFirst, cusEntSecond],
		});

		const existingRollovers: ExistingRollover[] = [
			{
				id: "rollover_1",
				cus_ent_id: "old_cus_ent_id",
				balance: 50,
				usage: 0,
				expires_at: null,
				entities: {},
				internal_feature_id: internalFeatureId,
			},
		];

		// Act
		applyExistingRollovers({ newCusProduct, existingRollovers });

		// Assert: only the FIRST cusEnt gets the rollover (due to .find() behavior)
		const firstCusEnt = newCusProduct.customer_entitlements.find(
			(ce) => ce.id === "cus_ent_first",
		);
		const secondCusEnt = newCusProduct.customer_entitlements.find(
			(ce) => ce.id === "cus_ent_second",
		);

		expect(firstCusEnt?.rollovers.length).toBe(1);
		expect(firstCusEnt?.rollovers[0].balance).toBe(50);
		expect(secondCusEnt?.rollovers.length).toBe(0);
	});
});
