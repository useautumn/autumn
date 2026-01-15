import { describe, expect, test } from "bun:test";
import type { ExistingUsages } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import chalk from "chalk";
import { applyExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/applyExistingUsages";

describe(chalk.yellowBright("applyExistingUsages (entity usages)"), () => {
	describe("entity usages deduction on entity-scoped cusEnt", () => {
		test("each entity's balance is reduced by its respective usage", () => {
			const internalFeatureId = "internal_feature_a";

			// Entity-scoped cusEnt with 3 entities, each with balance 100
			const entityScopedCusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 100,
				balance: 0, // Top-level balance not used for entity-scoped
				entityFeatureId: "entity_feature_id", // Makes it entity-scoped
				entities: {
					entity1: { id: "entity1", balance: 100, adjustment: 0 },
					entity2: { id: "entity2", balance: 100, adjustment: 0 },
					entity3: { id: "entity3", balance: 100, adjustment: 0 },
				},
			});

			const cusProduct = customerProducts.create({
				customerEntitlements: [entityScopedCusEnt],
			});

			// Apply entity usages: entity1: 50, entity2: 100, entity3: 25
			const existingUsages: ExistingUsages = {
				[internalFeatureId]: {
					usage: 0,
					entityUsages: {
						entity1: 50,
						entity2: 100,
						entity3: 25,
					},
				},
			};

			// Act
			applyExistingUsages({
				customerProduct: cusProduct,
				existingUsages,
				entities: [],
			});

			// Assert
			const updatedCusEnt = cusProduct.customer_entitlements[0];
			expect(updatedCusEnt.entities).not.toBeNull();
			expect(updatedCusEnt.entities?.entity1.balance).toBe(50); // 100 - 50
			expect(updatedCusEnt.entities?.entity2.balance).toBe(0); // 100 - 100
			expect(updatedCusEnt.entities?.entity3.balance).toBe(75); // 100 - 25
		});
	});

	describe("entity usages on non-entity-scoped cusEnt", () => {
		test("nothing is deducted when entityUsages are applied to non-entity-scoped cusEnt", () => {
			const internalFeatureId = "internal_feature_a";

			// Non-entity-scoped cusEnt (no entityFeatureId, entities is null)
			const nonEntityScopedCusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 100,
				balance: 100,
				// No entityFeatureId - not entity-scoped
			});

			const cusProduct = customerProducts.create({
				customerEntitlements: [nonEntityScopedCusEnt],
			});

			// Try to apply entity usages to non-entity-scoped cusEnt
			const existingUsages: ExistingUsages = {
				[internalFeatureId]: {
					usage: 0,
					entityUsages: {
						entity1: 50,
						entity2: 100,
					},
				},
			};

			// Act
			applyExistingUsages({
				customerProduct: cusProduct,
				existingUsages,
				entities: [],
			});

			// Assert: Balance should remain unchanged since cusEnt is not entity-scoped
			const updatedCusEnt = cusProduct.customer_entitlements[0];
			expect(updatedCusEnt.balance).toBe(100); // Unchanged
			expect(updatedCusEnt.entities).toBeNull(); // Still null
		});
	});

	describe("top-level usage on entity-scoped cusEnt", () => {
		test("entity balances are deducted as if aggregated", () => {
			const internalFeatureId = "internal_feature_a";

			// Entity-scoped cusEnt with 3 entities
			const entityScopedCusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 50,
				balance: 0, // Top-level balance not used for entity-scoped
				entityFeatureId: "entity_feature_id", // Makes it entity-scoped
				entities: {
					entity1: { id: "entity1", balance: 50, adjustment: 0 },
					entity2: { id: "entity2", balance: 50, adjustment: 0 },
					entity3: { id: "entity3", balance: 50, adjustment: 0 },
				},
			});

			const customerProduct = customerProducts.create({
				customerEntitlements: [entityScopedCusEnt],
			});

			// Apply top-level usage (no targetEntityId) - should aggregate across entities
			// Total entity balance = 150, usage = 80
			// Should deduct from entities in order: entity1: 50->0, entity2: 50->20
			const existingUsages: ExistingUsages = {
				[internalFeatureId]: {
					usage: 80,
					entityUsages: {},
				},
			};

			// Act
			applyExistingUsages({ customerProduct, existingUsages, entities: [] });

			// Assert: Deduction should flow through entities
			const updatedCusEnt = customerProduct.customer_entitlements[0];
			expect(updatedCusEnt.entities).not.toBeNull();

			// The total deducted should be 80, distributed across entities
			const totalRemainingBalance =
				(updatedCusEnt.entities?.entity1.balance ?? 0) +
				(updatedCusEnt.entities?.entity2.balance ?? 0) +
				(updatedCusEnt.entities?.entity3.balance ?? 0);

			expect(totalRemainingBalance).toBe(70); // 150 - 80 = 70
		});
	});

	describe("entity balances can go negative when usage_allowed is true", () => {
		test("each entity balance can be deducted below 0", () => {
			const internalFeatureId = "internal_feature_a";

			// Entity-scoped cusEnt with usage_allowed = true
			const entityScopedCusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 50,
				balance: 0,
				usageAllowed: true, // Can go negative
				entityFeatureId: "entity_feature_id",
				entities: {
					entity1: { id: "entity1", balance: 50, adjustment: 0 },
					entity2: { id: "entity2", balance: 30, adjustment: 0 },
				},
			});

			const customerProduct = customerProducts.create({
				customerEntitlements: [entityScopedCusEnt],
			});

			// Apply entity usages that exceed balances
			const existingUsages: ExistingUsages = {
				[internalFeatureId]: {
					usage: 0,
					entityUsages: {
						entity1: 70, // 50 - 70 = -20
						entity2: 50, // 30 - 50 = -20
					},
				},
			};

			// Act
			applyExistingUsages({ customerProduct, existingUsages, entities: [] });

			// Assert: Entity balances should go negative
			const updatedCusEnt = customerProduct.customer_entitlements[0];
			expect(updatedCusEnt.entities).not.toBeNull();
			expect(updatedCusEnt.entities?.entity1.balance).toBe(-20); // 50 - 70 = -20
			expect(updatedCusEnt.entities?.entity2.balance).toBe(-20); // 30 - 50 = -20
		});
	});
});
