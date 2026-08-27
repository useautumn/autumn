/** Carry-over moves balance usage with its complete per-source tier position. */

import { describe, expect, test } from "bun:test";
import {
	type ExistingUsages,
	FeatureType,
	type FullCustomerEntitlement,
	type UsageAttribution,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { applyExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/applyExistingUsages.js";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages.js";

const CREDIT_FEATURE_ID = "invoice_credits";
const CREDIT_INTERNAL_FEATURE_ID = "internal_invoice_credits";
const SOURCE_A_ID = "feature_a";
const SOURCE_A_INTERNAL_ID = "internal_feature_a";
const SOURCE_B_ID = "feature_b";
const SOURCE_B_INTERNAL_ID = "internal_feature_b";

const usageAttribution = {
	[SOURCE_A_INTERNAL_ID]: { units: 30_000, credits: 260 },
	[SOURCE_B_INTERNAL_ID]: { units: 5_000, credits: 500 },
};

const makeRateCardEntitlement = ({
	balance,
	attribution = usageAttribution,
	invoiceCredit = true,
}: {
	balance: number;
	attribution?: UsageAttribution;
	invoiceCredit?: boolean;
}): FullCustomerEntitlement => {
	const customerEntitlement = customerEntitlements.create({
		featureId: CREDIT_FEATURE_ID,
		internalFeatureId: CREDIT_INTERNAL_FEATURE_ID,
		featureName: "Invoice credits",
		featureType: FeatureType.CreditSystem,
		featureConfig: {
			invoice_credit: invoiceCredit,
			schema: invoiceCredit
				? []
				: [SOURCE_A_ID, SOURCE_B_ID].map((meteredFeatureId) => ({
						metered_feature_id: meteredFeatureId,
						feature_amount: 100,
						tier_behavior: "graduated" as const,
						tiers: [{ to: "inf" as const, credit_amount: 1 }],
					})),
		},
		allowance: 1_000,
		balance,
	});
	customerEntitlement.usage_attribution = structuredClone(attribution);
	return customerEntitlement;
};

describe("credit-rate usage attribution carry-over", () => {
	test.concurrent("carry all preserves the complete attribution object", () => {
		const customerProduct = customerProducts.create({
			customerEntitlements: [makeRateCardEntitlement({ balance: 240 })],
		});

		const existingUsages = cusProductToExistingUsages({
			cusProduct: customerProduct,
			carryAllConsumableFeatures: true,
		});

		expect(existingUsages[CREDIT_INTERNAL_FEATURE_ID]).toEqual({
			usage: 760,
			entityUsages: {},
			usageAttribution,
		});
	});

	test.concurrent(
		"feature_ids carries attribution when the credit feature is selected",
		() => {
			const customerProduct = customerProducts.create({
				customerEntitlements: [makeRateCardEntitlement({ balance: 240 })],
			});

			const existingUsages = cusProductToExistingUsages({
				cusProduct: customerProduct,
				consumableFeatureIdsToCarry: [CREDIT_FEATURE_ID],
			});

			expect(existingUsages[CREDIT_INTERNAL_FEATURE_ID]).toEqual({
				usage: 760,
				entityUsages: {},
				usageAttribution,
			});
		},
	);

	test.concurrent(
		"carry all preserves tier position when invoice rendering is disabled",
		() => {
			const customerProduct = customerProducts.create({
				customerEntitlements: [
					makeRateCardEntitlement({
						balance: 240,
						invoiceCredit: false,
					}),
				],
			});

			const existingUsages = cusProductToExistingUsages({
				cusProduct: customerProduct,
				carryAllConsumableFeatures: true,
			});

			expect(existingUsages[CREDIT_INTERNAL_FEATURE_ID]).toEqual({
				usage: 760,
				entityUsages: {},
				usageAttribution,
			});
		},
	);

	test.concurrent(
		"rejects duplicate source positions from multiple credit entitlements",
		() => {
			const customerProduct = customerProducts.create({
				customerEntitlements: [
					makeRateCardEntitlement({
						balance: 988,
						attribution: {
							[SOURCE_A_INTERNAL_ID]: { units: 1_000, credits: 10 },
							[SOURCE_B_INTERNAL_ID]: { units: 20, credits: 2 },
						},
					}),
					makeRateCardEntitlement({
						balance: 992,
						attribution: {
							[SOURCE_A_INTERNAL_ID]: { units: 500, credits: 5 },
							[SOURCE_B_INTERNAL_ID]: { units: 30, credits: 3 },
						},
					}),
				],
			});

			expect(() =>
				cusProductToExistingUsages({
					cusProduct: customerProduct,
					carryAllConsumableFeatures: true,
				}),
			).toThrow(
				"carry_over_usages cannot merge multiple attribution positions for credit feature 'invoice_credits'.",
			);
		},
	);

	test.concurrent(
		"rollover-funded attribution does not deduct the main allowance twice",
		() => {
			const customerProduct = customerProducts.create({
				customerEntitlements: [
					makeRateCardEntitlement({
						balance: 1_000,
						attribution: {
							[SOURCE_A_INTERNAL_ID]: { units: 5_000, credits: 50 },
						},
					}),
				],
			});

			const existingUsages = cusProductToExistingUsages({
				cusProduct: customerProduct,
				carryAllConsumableFeatures: true,
			});

			expect(existingUsages[CREDIT_INTERNAL_FEATURE_ID]).toEqual({
				usage: 0,
				entityUsages: {},
				usageAttribution: {
					[SOURCE_A_INTERNAL_ID]: { units: 5_000, credits: 50 },
				},
			});

			const targetCustomerEntitlement = makeRateCardEntitlement({
				balance: 1_000,
			});
			targetCustomerEntitlement.usage_attribution = {};
			const targetCustomerProduct = customerProducts.create({
				customerEntitlements: [targetCustomerEntitlement],
			});
			applyExistingUsages({
				ctx: contexts.create({}),
				customerProduct: targetCustomerProduct,
				existingUsages,
				entities: [],
			});

			expect(targetCustomerEntitlement.balance).toBe(1_000);
			expect(targetCustomerEntitlement.usage_attribution).toEqual({
				[SOURCE_A_INTERNAL_ID]: { units: 5_000, credits: 50 },
			});
		},
	);

	test.concurrent(
		"applying carried usage installs the matching attribution on the target",
		() => {
			const targetCustomerEntitlement = makeRateCardEntitlement({
				balance: 1_000,
			});
			targetCustomerEntitlement.usage_attribution = {};
			const customerProduct = customerProducts.create({
				customerEntitlements: [targetCustomerEntitlement],
			});
			const existingUsages: ExistingUsages = {
				[CREDIT_INTERNAL_FEATURE_ID]: {
					usage: 260,
					entityUsages: {},
					usageAttribution: {
						[SOURCE_A_INTERNAL_ID]: usageAttribution[SOURCE_A_INTERNAL_ID],
					},
				},
			};

			applyExistingUsages({
				ctx: contexts.create({}),
				customerProduct,
				existingUsages,
				entities: [],
			});

			expect(targetCustomerEntitlement.balance).toBe(740);
			expect(targetCustomerEntitlement.usage_attribution).toEqual({
				[SOURCE_A_INTERNAL_ID]: usageAttribution[SOURCE_A_INTERNAL_ID],
			});
		},
	);
});
