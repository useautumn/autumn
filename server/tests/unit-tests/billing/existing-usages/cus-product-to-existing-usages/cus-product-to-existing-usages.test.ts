import { describe, expect, test } from "bun:test";
import { EntInterval } from "@autumn/shared";
import { createMockCusEntitlement } from "@tests/utils/mockUtils/cusEntitlementMocks";
import { createMockCustomerProduct } from "@tests/utils/mockUtils/cusProductMocks";
import { createMockRollover } from "@tests/utils/mockUtils/rolloverMocks";
import chalk from "chalk";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages";

describe(chalk.yellowBright("cusProductToExistingUsages"), () => {
	describe("multiple cusEnts (lifetime and monthly)", () => {
		test("aggregates usage across lifetime and monthly cusEnts", () => {
			const internalFeatureId = "internal_feature_a";

			// Lifetime cusEnt: allowance 100, balance 80 -> usage = 20
			const lifetimeCusEnt = createMockCusEntitlement({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 100,
				balance: 80,
				interval: EntInterval.Lifetime,
			});

			// Monthly cusEnt: allowance 50, balance 30 -> usage = 20
			const monthlyCusEnt = createMockCusEntitlement({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 50,
				balance: 30,
				interval: EntInterval.Month,
				nextResetAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
			});

			const cusProduct = createMockCustomerProduct({
				customerEntitlements: [lifetimeCusEnt, monthlyCusEnt],
			});

			// Act
			const existingUsages = cusProductToExistingUsages({ cusProduct });

			// Assert: Total usage should be 40 (20 + 20)
			expect(existingUsages[internalFeatureId]).toBeDefined();
			expect(existingUsages[internalFeatureId].usage).toBe(40);
			expect(existingUsages[internalFeatureId].entityUsages).toEqual({});
		});
	});

	describe("top-level and entity-scoped cusEnts for same feature", () => {
		test("reflects both top-level usage and entity usages", () => {
			const internalFeatureId = "internal_feature_a";

			// Top-level cusEnt: allowance 100, balance 70 -> usage = 30
			const topLevelCusEnt = createMockCusEntitlement({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 100,
				balance: 70,
			});

			// Entity-scoped cusEnt with entities
			const entityScopedCusEnt = createMockCusEntitlement({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 50,
				balance: 0, // Top-level balance not used for entity-scoped
				entityFeatureId: "entity_feature_id",
				entities: {
					entity1: { id: "entity1", balance: 40, adjustment: 0 },
					entity2: { id: "entity2", balance: 25, adjustment: 0 },
				},
			});

			const cusProduct = createMockCustomerProduct({
				customerEntitlements: [topLevelCusEnt, entityScopedCusEnt],
			});

			// Act
			const existingUsages = cusProductToExistingUsages({ cusProduct });

			// Assert
			expect(existingUsages[internalFeatureId]).toBeDefined();
			// Top-level usage: 30
			expect(existingUsages[internalFeatureId].usage).toBe(30);
			// Entity usages reflect current balances (not usage)
			expect(existingUsages[internalFeatureId].entityUsages).toEqual({
				entity1: 40,
				entity2: 25,
			});
		});
	});

	describe("cusEnt with rollovers", () => {
		test("usage calculation excludes rollover balance", () => {
			const internalFeatureId = "internal_feature_a";

			// CusEnt: allowance 100, balance 120 (includes 50 from rollover)
			// Expected usage = allowance - (balance - rollover) = 100 - (120 - 50) = 100 - 70 = 30
			// But since we calculate: usage = grantedBalance - currentBalance
			// And grantedBalance doesn't include rollovers by default
			// usage = 100 - 120 = -20 (which would be wrong if we just did it this way)
			//
			// Actually, the current balance is 120 (which includes rollover usage),
			// so if allowance is 100 and balance is 120, it means user got +20 from somewhere
			// In this test, we're checking that the rollover doesn't inflate the "starting" balance
			//
			// Let's set up: allowance 100, current balance 80, rollover balance 30 (unused)
			// The usage should be: 100 - 80 = 20 (rollover's 30 is NOT counted in starting balance)
			const cusEntWithRollover = createMockCusEntitlement({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 100,
				balance: 80, // Current balance
			});

			// Add rollover to the cusEnt
			cusEntWithRollover.rollovers = [
				createMockRollover({
					cusEntId: cusEntWithRollover.id,
					balance: 30, // Rollover balance (should not be counted in usage calculation)
					expiresAt: Date.now() + 60 * 24 * 60 * 60 * 1000, // 60 days
				}),
			];

			const cusProduct = createMockCustomerProduct({
				customerEntitlements: [cusEntWithRollover],
			});

			// Act
			const existingUsages = cusProductToExistingUsages({ cusProduct });

			// Assert: Usage should be 20 (allowance 100 - balance 80)
			// NOT 50 (allowance 100 + rollover 30 - balance 80)
			expect(existingUsages[internalFeatureId]).toBeDefined();
			expect(existingUsages[internalFeatureId].usage).toBe(20);
		});
	});
});
