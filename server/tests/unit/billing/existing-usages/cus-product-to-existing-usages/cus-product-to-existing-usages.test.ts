import { describe, expect, test } from "bun:test";
import { EntInterval } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { rollovers } from "@tests/utils/fixtures/db/rollovers";
import chalk from "chalk";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages";

describe(chalk.yellowBright("cusProductToExistingUsages"), () => {
	describe("multiple cusEnts (lifetime and monthly)", () => {
		test("aggregates usage across lifetime and monthly cusEnts", () => {
			const internalFeatureId = "internal_feature_a";

			const lifetimeCusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 100,
				balance: 80,
				interval: EntInterval.Lifetime,
			});

			const monthlyCusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 50,
				balance: 30,
				interval: EntInterval.Month,
				nextResetAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
			});

			const cusProduct = customerProducts.create({
				customerEntitlements: [lifetimeCusEnt, monthlyCusEnt],
			});

			const existingUsages = cusProductToExistingUsages({
				cusProduct,
				carryAllConsumableFeatures: true,
			});

			expect(existingUsages[internalFeatureId]).toBeDefined();
			expect(existingUsages[internalFeatureId].usage).toBe(40);
			expect(existingUsages[internalFeatureId].entityUsages).toEqual({});
		});
	});

	describe("top-level and entity-scoped cusEnts for same feature", () => {
		test("reflects both top-level usage and entity usages", () => {
			const internalFeatureId = "internal_feature_a";

			const topLevelCusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 100,
				balance: 70,
			});

			const entityScopedCusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 50,
				balance: 0,
				entityFeatureId: "entity_feature_id",
				entities: {
					entity1: { id: "entity1", balance: 40, adjustment: 0 },
					entity2: { id: "entity2", balance: 25, adjustment: 0 },
				},
			});

			const cusProduct = customerProducts.create({
				customerEntitlements: [topLevelCusEnt, entityScopedCusEnt],
			});

			const existingUsages = cusProductToExistingUsages({
				cusProduct,
				carryAllConsumableFeatures: true,
			});

			expect(existingUsages[internalFeatureId]).toBeDefined();
			expect(existingUsages[internalFeatureId].usage).toBe(30);
			expect(existingUsages[internalFeatureId].entityUsages).toEqual({
				entity1: 10,
				entity2: 25,
			});
		});
	});

	describe("cusEnt with rollovers", () => {
		test("usage calculation excludes rollover balance", () => {
			const internalFeatureId = "internal_feature_a";

			const cusEntWithRollover = customerEntitlements.create({
				internalFeatureId,
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 100,
				balance: 80,
			});

			cusEntWithRollover.rollovers = [
				rollovers.create({
					cusEntId: cusEntWithRollover.id,
					balance: 30,
					expiresAt: Date.now() + 60 * 24 * 60 * 60 * 1000,
				}),
			];

			const cusProduct = customerProducts.create({
				customerEntitlements: [cusEntWithRollover],
			});

			const existingUsages = cusProductToExistingUsages({
				cusProduct,
				carryAllConsumableFeatures: true,
			});

			expect(existingUsages[internalFeatureId]).toBeDefined();
			expect(existingUsages[internalFeatureId].usage).toBe(20);
		});
	});
});
