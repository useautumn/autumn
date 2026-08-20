import { describe, expect, test } from "bun:test";
import { deriveVariantIntents } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/derive/deriveVariantIntents";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { products } from "@tests/utils/fixtures/db/products";

const emptyStates = ({
	planIds,
}: {
	planIds: string[];
}): ProductStatesContext => ({
	statesByPlanVersion: {},
	versionsByPlanId: Object.fromEntries(planIds.map((planId) => [planId, []])),
	rewardProgramsByPlanId: {},
});

const baseProduct = {
	...products.createFull({ id: "team" }),
	entitlements: [],
	prices: [],
	free_trial: null,
};

describe("deriveVariantIntents", () => {
	test("empty versionsByPlanId entry still emits variant_link", () => {
		const intents = deriveVariantIntents({
			intent: {
				productKey: { planId: "team", version: 1 },
				planParams: { plan_id: "team", version: 1 },
				source: "direct",
			},
			upsert: {
				row: {
					planId: "team",
					version: 1,
					op: "none",
					source: "direct",
					versioning: "existing",
					currentFullProduct: baseProduct,
					baseFullProduct: null,
					nextFullProduct: baseProduct,
				},
				declaredVariants: [{ variant_plan_id: "team-eu", name: "Team EU" }],
				state: { hasCustomers: false },
			} as UpsertProductPlan,
			projectedProductStatesContext: emptyStates({
				planIds: ["team", "team-eu"],
			}),
		});

		expect(intents).toHaveLength(1);
		expect(intents[0]?.source).toBe("variant_link");
		expect(intents[0]?.baseInternalProductId).toBe(baseProduct.internal_id);
		expect(intents[0]?.planParams.plan_id).toBe("team-eu");
	});

	test("existing variant omitted from propagate and customize emits nothing", () => {
		const intents = deriveVariantIntents({
			intent: {
				productKey: { planId: "team", version: 1 },
				planParams: { plan_id: "team", version: 1 },
				source: "direct",
			},
			upsert: {
				row: {
					planId: "team",
					version: 1,
					op: "update",
					source: "direct",
					versioning: "existing",
					currentFullProduct: baseProduct,
					baseFullProduct: null,
					nextFullProduct: baseProduct,
				},
				declaredVariants: [{ variant_plan_id: "team-eu" }],
				state: { hasCustomers: false },
			} as UpsertProductPlan,
			projectedProductStatesContext: {
				...emptyStates({ planIds: ["team", "team-eu"] }),
				versionsByPlanId: {
					team: [baseProduct],
					"team-eu": [
						{
							...baseProduct,
							id: "team-eu",
							internal_id: "internal_team-eu",
							base_internal_product_id: baseProduct.internal_id,
						},
					],
				},
			},
		});

		expect(intents).toEqual([]);
	});

	test("existing standalone listed in variants[] emits a pointer adopt", () => {
		const standalone = {
			...baseProduct,
			id: "team-eu",
			internal_id: "internal_team-eu",
			base_internal_product_id: null,
		};
		const intents = deriveVariantIntents({
			intent: {
				productKey: { planId: "team", version: 1 },
				planParams: { plan_id: "team", version: 1 },
				source: "direct",
			},
			upsert: {
				row: {
					planId: "team",
					version: 1,
					op: "none",
					source: "direct",
					versioning: "existing",
					currentFullProduct: baseProduct,
					baseFullProduct: null,
					nextFullProduct: baseProduct,
				},
				declaredVariants: [{ variant_plan_id: "team-eu" }],
				state: { hasCustomers: false },
			} as UpsertProductPlan,
			projectedProductStatesContext: {
				...emptyStates({ planIds: ["team", "team-eu"] }),
				versionsByPlanId: {
					team: [baseProduct],
					"team-eu": [standalone],
				},
			},
		});

		expect(intents).toHaveLength(1);
		expect(intents[0]?.source).toBe("repoint");
		expect(intents[0]?.baseInternalProductId).toBe(baseProduct.internal_id);
		expect(intents[0]?.planParams.plan_id).toBe("team-eu");
	});

	test("nested base_variant_id null emits an unlink adopt", () => {
		const linked = {
			...baseProduct,
			id: "team-eu",
			internal_id: "internal_team-eu",
			base_internal_product_id: baseProduct.internal_id,
		};
		const intents = deriveVariantIntents({
			intent: {
				productKey: { planId: "team", version: 1 },
				planParams: { plan_id: "team", version: 1 },
				source: "direct",
			},
			upsert: {
				row: {
					planId: "team",
					version: 1,
					op: "none",
					source: "direct",
					versioning: "existing",
					currentFullProduct: baseProduct,
					baseFullProduct: null,
					nextFullProduct: baseProduct,
				},
				declaredVariants: [
					{ variant_plan_id: "team-eu", base_variant_id: null },
				],
				state: { hasCustomers: false },
			} as UpsertProductPlan,
			projectedProductStatesContext: {
				...emptyStates({ planIds: ["team", "team-eu"] }),
				versionsByPlanId: {
					team: [baseProduct],
					"team-eu": [linked],
				},
			},
		});

		expect(intents).toHaveLength(1);
		expect(intents[0]?.source).toBe("repoint");
		expect(intents[0]?.unlink).toBe(true);
		expect(intents[0]?.planParams.base_variant_id).toBeNull();
	});

	test("settings change emits latest variant even when omitted from propagate", () => {
		const current = { ...baseProduct, description: "before" };
		const next = { ...baseProduct, description: "after" };
		const variant = {
			...baseProduct,
			id: "team-eu",
			internal_id: "internal_team-eu",
			base_internal_product_id: baseProduct.internal_id,
		};

		const intents = deriveVariantIntents({
			intent: {
				productKey: { planId: "team", version: 1 },
				planParams: { plan_id: "team", version: 1, description: "after" },
				source: "direct",
			},
			upsert: {
				row: {
					planId: "team",
					version: 1,
					op: "update",
					source: "direct",
					versioning: "existing",
					currentFullProduct: current,
					baseFullProduct: null,
					nextFullProduct: next,
				},
				state: { hasCustomers: false },
			} as UpsertProductPlan,
			projectedProductStatesContext: {
				...emptyStates({ planIds: ["team", "team-eu"] }),
				versionsByPlanId: {
					team: [next],
					"team-eu": [variant],
				},
			},
		});

		expect(intents).toHaveLength(1);
		expect(intents[0]?.source).toBe("variant_propagation");
		expect(intents[0]?.planParams.description).toBe("after");
		expect(intents[0]?.editDiff).toBeUndefined();
	});

	test("base mint pin emits repoint with the new internal_id", () => {
		const oldBase = { ...baseProduct, internal_id: "internal_team_v1" };
		const newBase = {
			...baseProduct,
			internal_id: "internal_team_v2",
			version: 2,
		};
		const variant = {
			...baseProduct,
			id: "team-eu",
			internal_id: "internal_team-eu",
			base_internal_product_id: oldBase.internal_id,
		};

		const intents = deriveVariantIntents({
			intent: {
				productKey: { planId: "team", version: 2 },
				planParams: {
					plan_id: "team",
					version: 2,
					versioning: "new_version",
				},
				source: "direct",
			},
			upsert: {
				row: {
					planId: "team",
					version: 2,
					op: "create",
					source: "direct",
					versioning: "new_version",
					currentFullProduct: null,
					baseFullProduct: oldBase,
					nextFullProduct: newBase,
				},
				state: { hasCustomers: false },
			} as UpsertProductPlan,
			projectedProductStatesContext: {
				...emptyStates({ planIds: ["team", "team-eu"] }),
				versionsByPlanId: {
					team: [newBase, oldBase],
					"team-eu": [variant],
				},
			},
		});

		expect(intents).toHaveLength(1);
		expect(intents[0]?.source).toBe("repoint");
		expect(intents[0]?.baseInternalProductId).toBe(newBase.internal_id);
		expect(intents[0]?.editDiff).toBeUndefined();
	});
});
