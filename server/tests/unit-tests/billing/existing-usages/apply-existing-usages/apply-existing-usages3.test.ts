import { describe, expect, test } from "bun:test";
import { EntInterval, type ExistingUsages } from "@autumn/shared";
import { createMockCusEntitlement } from "@tests/utils/mockUtils/cusEntitlementMocks";
import { createMockCustomerProduct } from "@tests/utils/mockUtils/cusProductMocks";
import chalk from "chalk";
import { applyExistingUsages } from "@/internal/billing/billingUtils/handleExistingUsages/applyExistingUsages";

describe(
	chalk.yellowBright("applyExistingUsages (testing deduction order)"),
	() => {
		describe("interval-based deduction order", () => {
			test("monthly cusEnt is deducted before lifetime cusEnt", () => {
				const internalFeatureId = "internal_feature_a";

				// Lifetime cusEnt with balance 5
				const lifetimeCusEnt = createMockCusEntitlement({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 5,
					balance: 5,
					interval: EntInterval.Lifetime,
				});

				// Monthly cusEnt with balance 5
				const monthlyCusEnt = createMockCusEntitlement({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 5,
					balance: 5,
					interval: EntInterval.Month,
					nextResetAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
				});

				const cusProduct = createMockCustomerProduct({
					customerEntitlements: [monthlyCusEnt, lifetimeCusEnt], // Monthly first in array
				});

				// Apply 7 usage (should deplete lifetime first, then take 2 from monthly)
				const existingUsages: ExistingUsages = {
					[internalFeatureId]: { usage: 7, entityUsages: {} },
				};

				// Act
				applyExistingUsages({
					customerProduct: cusProduct,
					existingUsages,
					entities: [],
				});

				// Assert: Lifetime should be depleted first (0), then monthly should have 3 remaining
				const updatedLifetime = cusProduct.customer_entitlements.find(
					(ce) => ce.entitlement.interval === EntInterval.Lifetime,
				);
				const updatedMonthly = cusProduct.customer_entitlements.find(
					(ce) => ce.entitlement.interval === EntInterval.Month,
				);

				expect(updatedMonthly?.balance).toBe(0);
				expect(updatedLifetime?.balance).toBe(3);
			});
		});

		describe("usage_allowed-based deduction order", () => {
			test("prepaid cusEnt (usage_allowed=false) is deducted before pay-per-use cusEnt (usage_allowed=true)", () => {
				const internalFeatureId = "internal_feature_a";

				// Prepaid cusEnt (usage_allowed = false) with balance 5
				const prepaidCusEnt = createMockCusEntitlement({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 5,
					balance: 5,
					usageAllowed: false,
				});

				// Pay-per-use cusEnt (usage_allowed = true) with balance 5
				const payPerUseCusEnt = createMockCusEntitlement({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 5,
					balance: 5,
					usageAllowed: true,
				});

				const customerProduct = createMockCustomerProduct({
					customerEntitlements: [payPerUseCusEnt, prepaidCusEnt], // Pay-per-use first in array
				});

				// Apply 7 usage (should deplete prepaid first, then take 2 from pay-per-use)
				const existingUsages: ExistingUsages = {
					[internalFeatureId]: { usage: 7, entityUsages: {} },
				};

				// Act
				applyExistingUsages({ customerProduct, existingUsages, entities: [] });

				// Assert: Prepaid should be depleted first (0), then pay-per-use should have 3 remaining
				const updatedPrepaid = customerProduct.customer_entitlements.find(
					(ce) => ce.usage_allowed === false,
				);
				const updatedPayPerUse = customerProduct.customer_entitlements.find(
					(ce) => ce.usage_allowed === true,
				);

				expect(updatedPrepaid?.balance).toBe(0);
				expect(updatedPayPerUse?.balance).toBe(3);
			});
		});

		describe("negative balance deduction", () => {
			test("prepaid monthly is deducted to 0, pay-per-use monthly goes negative", () => {
				const internalFeatureId = "internal_feature_a";

				// Prepaid monthly (usage_allowed = false, cannot go negative)
				const prepaidMonthly = createMockCusEntitlement({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 5,
					balance: 5,
					usageAllowed: false,
					interval: EntInterval.Month,
					nextResetAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
				});

				// Pay-per-use monthly (usage_allowed = true, can go negative)
				const payPerUseMonthly = createMockCusEntitlement({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 5,
					balance: 5,
					usageAllowed: true,
					interval: EntInterval.Month,
					nextResetAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
				});

				const customerProduct = createMockCustomerProduct({
					customerEntitlements: [payPerUseMonthly, prepaidMonthly], // Random order
				});

				// Apply 12 usage (5 from prepaid, 7 from pay-per-use -> goes to -2)
				const existingUsages: ExistingUsages = {
					[internalFeatureId]: { usage: 12, entityUsages: {} },
				};

				// Act
				applyExistingUsages({ customerProduct, existingUsages, entities: [] });

				const updatedPrepaid = customerProduct.customer_entitlements.find(
					(ce) => ce.usage_allowed === false,
				);
				const updatedPayPerUse = customerProduct.customer_entitlements.find(
					(ce) => ce.usage_allowed === true,
				);

				// Prepaid should be at 0 (cannot go negative)
				expect(updatedPrepaid?.balance).toBe(0);
				// Pay-per-use should be at -2 (5 - 7 = -2)
				expect(updatedPayPerUse?.balance).toBe(-2);
			});
		});

		describe("combined ordering", () => {
			test("prepaid monthly -> prepaid lifetime -> pay-per-use monthly", () => {
				const internalFeatureId = "internal_feature_a";

				// 3 cusEnts with different combinations
				const prepaidMonthly = createMockCusEntitlement({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 2,
					balance: 2,
					usageAllowed: false,
					interval: EntInterval.Month,
					nextResetAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
				});

				const prepaidLifetime = createMockCusEntitlement({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 2,
					balance: 2,
					usageAllowed: false,
					interval: EntInterval.Lifetime,
				});

				const payPerUseMonthly = createMockCusEntitlement({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 2,
					balance: 2,
					usageAllowed: true,
					interval: EntInterval.Month,
					nextResetAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
				});

				// Add in random order
				const customerProduct = createMockCustomerProduct({
					customerEntitlements: [
						payPerUseMonthly,
						prepaidLifetime,
						prepaidMonthly,
					],
				});

				// Apply 5 usage (should take 2 from prepaid monthly, 2 from prepaid lifetime, 1 from pay-per-use monthly)
				const existingUsages: ExistingUsages = {
					[internalFeatureId]: { usage: 5, entityUsages: {} },
				};

				// Act
				applyExistingUsages({ customerProduct, existingUsages, entities: [] });

				// Find each cusEnt by their unique characteristics
				const findCusEnt = (usageAllowed: boolean, interval: EntInterval) =>
					customerProduct.customer_entitlements.find(
						(ce) =>
							ce.usage_allowed === usageAllowed &&
							ce.entitlement.interval === interval,
					);

				const updatedPrepaidMonthly = findCusEnt(false, EntInterval.Month);
				const updatedPrepaidLifetime = findCusEnt(false, EntInterval.Lifetime);
				const updatedPayPerUseMonthly = findCusEnt(true, EntInterval.Month);

				// Expected order: prepaid monthly (0) -> prepaid lifetime (0) -> pay-per-use monthly (1)
				expect(updatedPrepaidMonthly?.balance).toBe(0);
				expect(updatedPayPerUseMonthly?.balance).toBe(0);
				expect(updatedPrepaidLifetime?.balance).toBe(1);
			});
		});
	},
);
