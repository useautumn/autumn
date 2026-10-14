import { describe, expect, test } from "bun:test";
import type { ExistingUsages } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { entities } from "@tests/utils/fixtures/db/entities";
import chalk from "chalk";
import { applyExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/applyExistingUsages";

const ctx = contexts.create({});

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

				applyExistingUsages({
					ctx,
					customerProduct: cusProduct,
					existingUsages,
					entities: entityList,
				});

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

				const existingUsages: ExistingUsages = {
					[internalFeatureIdA]: { usage: 5, entityUsages: {} },
				};

				applyExistingUsages({
					ctx,
					customerProduct,
					existingUsages,
					entities: entityList,
				});

				const updatedCusEntA = customerProduct.customer_entitlements.find(
					(ce) => ce.feature_id === "feature_a",
				);
				expect(updatedCusEntA?.balance).toBe(8);
			});

			test("two cusEnts for feature A with starting balance 2, 3 entities - distributes usage across cusEnts", () => {
				const internalFeatureIdA = "internal_feature_a";

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

				applyExistingUsages({
					ctx,
					customerProduct,
					existingUsages,
					entities: entityList,
				});

				const updatedCusEnts = customerProduct.customer_entitlements.filter(
					(ce) => ce.feature_id === "feature_a",
				);
				expect(updatedCusEnts[0]?.balance).toBe(0);
				expect(updatedCusEnts[1]?.balance).toBe(1);
			});
		});
	},
);
