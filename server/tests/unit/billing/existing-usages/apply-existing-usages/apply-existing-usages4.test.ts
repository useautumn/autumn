import { describe, expect, test } from "bun:test";
import type { ExistingUsages } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import chalk from "chalk";
import { applyExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/applyExistingUsages";

const ctx = contexts.create({});

describe(chalk.yellowBright("applyExistingUsages (entity usages)"), () => {
	describe("entity usages deduction on entity-scoped cusEnt", () => {
		test("each entity's balance is reduced by its respective usage", () => {
			const internalFeatureId = "internal_feature_a";

			const entityScopedCusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 100,
				balance: 0,
				entityFeatureId: "entity_feature_id",
				entities: {
					entity1: { id: "entity1", balance: 100, adjustment: 0 },
					entity2: { id: "entity2", balance: 100, adjustment: 0 },
					entity3: { id: "entity3", balance: 100, adjustment: 0 },
				},
			});

			const cusProduct = customerProducts.create({
				customerEntitlements: [entityScopedCusEnt],
			});

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

			applyExistingUsages({
				ctx,
				customerProduct: cusProduct,
				existingUsages,
				entities: [],
			});

			const updatedCusEnt = cusProduct.customer_entitlements[0];
			expect(updatedCusEnt.entities).not.toBeNull();
			expect(updatedCusEnt.entities?.entity1.balance).toBe(50);
			expect(updatedCusEnt.entities?.entity2.balance).toBe(0);
			expect(updatedCusEnt.entities?.entity3.balance).toBe(75);
		});
	});

	describe("entity usages on non-entity-scoped cusEnt", () => {
		test("nothing is deducted when entityUsages are applied to non-entity-scoped cusEnt", () => {
			const internalFeatureId = "internal_feature_a";

			const nonEntityScopedCusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 100,
				balance: 100,
			});

			const cusProduct = customerProducts.create({
				customerEntitlements: [nonEntityScopedCusEnt],
			});

			const existingUsages: ExistingUsages = {
				[internalFeatureId]: {
					usage: 0,
					entityUsages: {
						entity1: 50,
						entity2: 100,
					},
				},
			};

			applyExistingUsages({
				ctx,
				customerProduct: cusProduct,
				existingUsages,
				entities: [],
			});

			const updatedCusEnt = cusProduct.customer_entitlements[0];
			expect(updatedCusEnt.balance).toBe(100);
			expect(updatedCusEnt.entities).toBeNull();
		});
	});

	describe("top-level usage on entity-scoped cusEnt", () => {
		test("entity balances are deducted as if aggregated", () => {
			const internalFeatureId = "internal_feature_a";

			const entityScopedCusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 50,
				balance: 0,
				entityFeatureId: "entity_feature_id",
				entities: {
					entity1: { id: "entity1", balance: 50, adjustment: 0 },
					entity2: { id: "entity2", balance: 50, adjustment: 0 },
					entity3: { id: "entity3", balance: 50, adjustment: 0 },
				},
			});

			const customerProduct = customerProducts.create({
				customerEntitlements: [entityScopedCusEnt],
			});

			const existingUsages: ExistingUsages = {
				[internalFeatureId]: {
					usage: 80,
					entityUsages: {},
				},
			};

			applyExistingUsages({
				ctx,
				customerProduct,
				existingUsages,
				entities: [],
			});

			const updatedCusEnt = customerProduct.customer_entitlements[0];
			expect(updatedCusEnt.entities).not.toBeNull();

			const totalRemainingBalance =
				(updatedCusEnt.entities?.entity1.balance ?? 0) +
				(updatedCusEnt.entities?.entity2.balance ?? 0) +
				(updatedCusEnt.entities?.entity3.balance ?? 0);

			expect(totalRemainingBalance).toBe(70);
		});
	});

	describe("entity balances can go negative when usage_allowed is true", () => {
		test("each entity balance can be deducted below 0", () => {
			const internalFeatureId = "internal_feature_a";

			const entityScopedCusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 50,
				balance: 0,
				usageAllowed: true,
				entityFeatureId: "entity_feature_id",
				entities: {
					entity1: { id: "entity1", balance: 50, adjustment: 0 },
					entity2: { id: "entity2", balance: 30, adjustment: 0 },
				},
			});

			const customerProduct = customerProducts.create({
				customerEntitlements: [entityScopedCusEnt],
			});

			const existingUsages: ExistingUsages = {
				[internalFeatureId]: {
					usage: 0,
					entityUsages: {
						entity1: 70,
						entity2: 50,
					},
				},
			};

			applyExistingUsages({
				ctx,
				customerProduct,
				existingUsages,
				entities: [],
			});

			const updatedCusEnt = customerProduct.customer_entitlements[0];
			expect(updatedCusEnt.entities).not.toBeNull();
			expect(updatedCusEnt.entities?.entity1.balance).toBe(-20);
			expect(updatedCusEnt.entities?.entity2.balance).toBe(-20);
		});
	});

	describe("per-entity to per-entity preservation", () => {
		test("entity usages are preserved when updating from entity-scoped to entity-scoped cusEnt", () => {
			const internalFeatureId = "internal_feature_a";
			const entityFeatureId = "entity_feature_id";

			const entityScopedCusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 100,
				balance: 0,
				entityFeatureId,
				entities: {
					entity1: { id: "entity1", balance: 100, adjustment: 0 },
					entity2: { id: "entity2", balance: 100, adjustment: 0 },
					entity3: { id: "entity3", balance: 100, adjustment: 0 },
				},
			});

			const cusProduct = customerProducts.create({
				customerEntitlements: [entityScopedCusEnt],
			});

			const existingUsages: ExistingUsages = {
				[internalFeatureId]: {
					usage: 0,
					entityUsages: {
						entity1: 30,
						entity2: 50,
						entity3: 10,
					},
				},
			};

			applyExistingUsages({
				ctx,
				customerProduct: cusProduct,
				existingUsages,
				entities: [],
			});

			const updatedCusEnt = cusProduct.customer_entitlements[0];
			expect(updatedCusEnt.entities).not.toBeNull();
			expect(updatedCusEnt.entities?.entity1.balance).toBe(70);
			expect(updatedCusEnt.entities?.entity2.balance).toBe(50);
			expect(updatedCusEnt.entities?.entity3.balance).toBe(90);
		});

		test("entity usages are preserved even when some entities have no prior usage", () => {
			const internalFeatureId = "internal_feature_a";
			const entityFeatureId = "entity_feature_id";

			const entityScopedCusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 50,
				balance: 0,
				entityFeatureId,
				entities: {
					entity1: { id: "entity1", balance: 50, adjustment: 0 },
					entity2: { id: "entity2", balance: 50, adjustment: 0 },
					entity3: { id: "entity3", balance: 50, adjustment: 0 },
				},
			});

			const cusProduct = customerProducts.create({
				customerEntitlements: [entityScopedCusEnt],
			});

			const existingUsages: ExistingUsages = {
				[internalFeatureId]: {
					usage: 0,
					entityUsages: {
						entity1: 25,
					},
				},
			};

			applyExistingUsages({
				ctx,
				customerProduct: cusProduct,
				existingUsages,
				entities: [],
			});

			const updatedCusEnt = cusProduct.customer_entitlements[0];
			expect(updatedCusEnt.entities).not.toBeNull();
			expect(updatedCusEnt.entities?.entity1.balance).toBe(25);
			expect(updatedCusEnt.entities?.entity2.balance).toBe(50);
			expect(updatedCusEnt.entities?.entity3.balance).toBe(50);
		});
	});

	describe("entity to non-entity conversion", () => {
		test("entity usages are NOT summed when applied to non-entity-scoped cusEnt (current behavior)", () => {
			const internalFeatureId = "internal_feature_a";

			const nonEntityScopedCusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 300,
				balance: 300,
			});

			const cusProduct = customerProducts.create({
				customerEntitlements: [nonEntityScopedCusEnt],
			});

			const existingUsages: ExistingUsages = {
				[internalFeatureId]: {
					usage: 0,
					entityUsages: {
						entity1: 30,
						entity2: 50,
						entity3: 10,
					},
				},
			};

			applyExistingUsages({
				ctx,
				customerProduct: cusProduct,
				existingUsages,
				entities: [],
			});

			const updatedCusEnt = cusProduct.customer_entitlements[0];
			expect(updatedCusEnt.balance).toBe(300);
			expect(updatedCusEnt.entities).toBeNull();
		});
	});
});
