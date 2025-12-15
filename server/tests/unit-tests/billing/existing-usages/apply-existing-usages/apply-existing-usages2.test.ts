import { describe, expect, test } from "bun:test";
import type { ExistingUsages } from "@autumn/shared";
import { createMockCusEntitlement } from "@tests/utils/mockUtils/cusEntitlementMocks";
import { createMockCusProduct } from "@tests/utils/mockUtils/cusProductMocks";
import { createMockEntity } from "@tests/utils/mockUtils/entityMocks";
import chalk from "chalk";
import { applyExistingUsages } from "@/internal/billing/billingUtils/handleExistingUsages/applyExistingUsages";

describe(
	chalk.yellowBright("applyExistingUsages (testing entities flow)"),
	() => {
		describe("entities merge with existing usages", () => {
			test("empty existing usages, 2 entities on feature A and 3 entities on feature B", () => {
				const internalFeatureIdA = "internal_feature_a";
				const internalFeatureIdB = "internal_feature_b";

				const cusEntA = createMockCusEntitlement({
					internalFeatureId: internalFeatureIdA,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 10,
					balance: 10,
				});

				const cusEntB = createMockCusEntitlement({
					internalFeatureId: internalFeatureIdB,
					featureId: "feature_b",
					featureName: "Feature B",
					allowance: 10,
					balance: 10,
				});

				const cusProduct = createMockCusProduct({
					cusEntitlements: [cusEntA, cusEntB],
				});

				// 2 entities on feature A, 3 entities on feature B
				const entities = [
					createMockEntity({
						id: "ent1",
						featureId: "feature_a",
						internalFeatureId: internalFeatureIdA,
					}),
					createMockEntity({
						id: "ent2",
						featureId: "feature_a",
						internalFeatureId: internalFeatureIdA,
					}),
					createMockEntity({
						id: "ent3",
						featureId: "feature_b",
						internalFeatureId: internalFeatureIdB,
					}),
					createMockEntity({
						id: "ent4",
						featureId: "feature_b",
						internalFeatureId: internalFeatureIdB,
					}),
					createMockEntity({
						id: "ent5",
						featureId: "feature_b",
						internalFeatureId: internalFeatureIdB,
					}),
				];

				const existingUsages: ExistingUsages = {};

				// Act
				applyExistingUsages({ cusProduct, existingUsages, entities });

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

				const cusEntA = createMockCusEntitlement({
					internalFeatureId: internalFeatureIdA,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 10,
					balance: 10,
				});

				const cusProduct = createMockCusProduct({
					cusEntitlements: [cusEntA],
				});

				// 2 entities on feature A
				const entities = [
					createMockEntity({
						id: "ent1",
						featureId: "feature_a",
						internalFeatureId: internalFeatureIdA,
					}),
					createMockEntity({
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
				applyExistingUsages({ cusProduct, existingUsages, entities });

				// Assert: Entity count (2) takes priority, balance = 10 - 2 = 8
				const updatedCusEntA = cusProduct.customer_entitlements.find(
					(ce) => ce.feature_id === "feature_a",
				);
				expect(updatedCusEntA?.balance).toBe(8);
			});

			test("two cusEnts for feature A with starting balance 2, 3 entities - distributes usage across cusEnts", () => {
				const internalFeatureIdA = "internal_feature_a";

				// Two cusEnts for the same feature, each with balance 2
				const cusEntA1 = createMockCusEntitlement({
					internalFeatureId: internalFeatureIdA,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 2,
					balance: 2,
				});

				const cusEntA2 = createMockCusEntitlement({
					internalFeatureId: internalFeatureIdA,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 2,
					balance: 2,
				});

				const cusProduct = createMockCusProduct({
					cusEntitlements: [cusEntA1, cusEntA2],
				});

				// 3 entities on feature A
				const entities = [
					createMockEntity({
						id: "ent1",
						featureId: "feature_a",
						internalFeatureId: internalFeatureIdA,
					}),
					createMockEntity({
						id: "ent2",
						featureId: "feature_a",
						internalFeatureId: internalFeatureIdA,
					}),
					createMockEntity({
						id: "ent3",
						featureId: "feature_a",
						internalFeatureId: internalFeatureIdA,
					}),
				];

				const existingUsages: ExistingUsages = {};

				// Act
				applyExistingUsages({ cusProduct, existingUsages, entities });

				// Total usage = 3, distributed: first cusEnt uses 2, second cusEnt uses 1
				const updatedCusEnts = cusProduct.customer_entitlements.filter(
					(ce) => ce.feature_id === "feature_a",
				);
				expect(updatedCusEnts[0]?.balance).toBe(0);
				expect(updatedCusEnts[1]?.balance).toBe(1);
			});
		});
	},
);
