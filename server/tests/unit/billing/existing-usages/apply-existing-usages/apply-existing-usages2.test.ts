import { describe, expect, test } from "bun:test";
import type { ExistingUsages } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { entities } from "@tests/utils/fixtures/db/entities";
import chalk from "chalk";
import { applyExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/applyExistingUsages";

describe(
	chalk.yellowBright("applyExistingUsages (testing entities flow)"),
	() => {
		describe("entities merge with existing usages", () => {
			test("empty existing usages, 2 entities on feature A and 3 entities on feature B", () => {
				const internalFeatureIdA = "internal_feature_a";
				const internalFeatureIdB = "internal_feature_b";

				const cusEntA = customerEntitlements.create({
					internalFeatureId: internalFeatureIdA,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 10,
					balance: 10,
				});

				const cusEntB = customerEntitlements.create({
					internalFeatureId: internalFeatureIdB,
					featureId: "feature_b",
					featureName: "Feature B",
					allowance: 10,
					balance: 10,
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [cusEntA, cusEntB],
				});

				// 2 entities on feature A, 3 entities on feature B
				const entityList = [
					entities.create({
						id: "ent1",
						featureId: "feature_a",
						internalFeatureId: internalFeatureIdA,
					}),
					entities.create({
						id: "ent2",
						featureId: "feature_a",
						internalFeatureId: internalFeatureIdA,
					}),
					entities.create({
						id: "ent3",
						featureId: "feature_b",
						internalFeatureId: internalFeatureIdB,
					}),
					entities.create({
						id: "ent4",
						featureId: "feature_b",
						internalFeatureId: internalFeatureIdB,
					}),
					entities.create({
						id: "ent5",
						featureId: "feature_b",
						internalFeatureId: internalFeatureIdB,
					}),
				];

				const existingUsages: ExistingUsages = {};

				// Act
				applyExistingUsages({
					customerProduct: cusProduct,
					existingUsages,
					entities: entityList,
				});

				// Assert: Feature A balance = 10 - 2 = 8, Feature B balance = 10 - 3 = 7
				const updatedCusEntA = cusProduct.customer_entitlements.find(
					(ce) => ce.feature_id === "feature_a",
				);
				const updatedCusEntB = cusProduct.customer_entitlements.find(
					(ce) => ce.feature_id === "feature_b",
				);
				expect(updatedCusEntA?.balance).toBe(8);
				expect(updatedCusEntB?.balance).toBe(7);
			});

			test("existing usages has entry for feature A, 2 entities on feature A (entities take priority)", () => {
				const internalFeatureIdA = "internal_feature_a";

				const cusEntA = customerEntitlements.create({
					internalFeatureId: internalFeatureIdA,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 10,
					balance: 10,
				});

				const customerProduct = customerProducts.create({
					customerEntitlements: [cusEntA],
				});

				// 2 entities on feature A
				const entityList = [
					entities.create({
						id: "ent1",
						featureId: "feature_a",
						internalFeatureId: internalFeatureIdA,
					}),
					entities.create({
						id: "ent2",
						featureId: "feature_a",
						internalFeatureId: internalFeatureIdA,
					}),
				];

				// Existing usage says 5, but entities (2) should take priority
				const existingUsages: ExistingUsages = {
					[internalFeatureIdA]: { usage: 5, entityUsages: {} },
				};

				// Act
				applyExistingUsages({ customerProduct, existingUsages, entities: entityList });

				// Assert: Entity count (2) takes priority, balance = 10 - 2 = 8
				const updatedCusEntA = customerProduct.customer_entitlements.find(
					(ce) => ce.feature_id === "feature_a",
				);
				expect(updatedCusEntA?.balance).toBe(8);
			});

			test("two cusEnts for feature A with starting balance 2, 3 entities - distributes usage across cusEnts", () => {
				const internalFeatureIdA = "internal_feature_a";

				// Two cusEnts for the same feature, each with balance 2
				const cusEntA1 = customerEntitlements.create({
					internalFeatureId: internalFeatureIdA,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 2,
					balance: 2,
				});

				const cusEntA2 = customerEntitlements.create({
					internalFeatureId: internalFeatureIdA,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 2,
					balance: 2,
				});

				const customerProduct = customerProducts.create({
					customerEntitlements: [cusEntA1, cusEntA2],
				});

				// 3 entities on feature A
				const entityList = [
					entities.create({
						id: "ent1",
						featureId: "feature_a",
						internalFeatureId: internalFeatureIdA,
					}),
					entities.create({
						id: "ent2",
						featureId: "feature_a",
						internalFeatureId: internalFeatureIdA,
					}),
					entities.create({
						id: "ent3",
						featureId: "feature_a",
						internalFeatureId: internalFeatureIdA,
					}),
				];

				const existingUsages: ExistingUsages = {};

				// Act
				applyExistingUsages({ customerProduct, existingUsages, entities: entityList });

				// Total usage = 3, distributed: first cusEnt uses 2, second cusEnt uses 1
				const updatedCusEnts = customerProduct.customer_entitlements.filter(
					(ce) => ce.feature_id === "feature_a",
				);
				expect(updatedCusEnts[0]?.balance).toBe(0);
				expect(updatedCusEnts[1]?.balance).toBe(1);
			});
		});
	},
);
