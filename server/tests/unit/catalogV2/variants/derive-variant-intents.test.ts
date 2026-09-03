import { describe, expect, test } from "bun:test";
import { deriveVariantIntents } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/derive/deriveVariantIntents";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { emptyVersioningFlags } from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";
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

const mintVariantFromBase = ({
	sourceActive,
}: {
	sourceActive: boolean | undefined;
}) => {
	const oldBase = { ...baseProduct, internal_id: "internal_team_v1" };
	const newBase = {
		...baseProduct,
		internal_id: "internal_team_v2",
		version: 2,
		active: sourceActive === true,
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
				...(sourceActive === true ? { active: true } : {}),
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
			propagate: { variants: [{ plan_id: "team-eu" }] },
			state: { hasCustomers: false, planHadLiveVersions: true },
		} as UpsertProductPlan,
		projectedProductStatesContext: {
			...emptyStates({ planIds: ["team", "team-eu"] }),
			versionsByPlanId: {
				team: [newBase, oldBase],
				"team-eu": [variant],
			},
			statesByPlanVersion: {
				"team-eu@1": {
					productKey: { planId: "team-eu", version: 1 },
					currentFullProduct: variant,
					customerUsage: {
						...emptyVersioningFlags(),
						hasVersionableCustomerProducts: true,
					},
				},
			},
		},
	});

	return { intents };
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
				state: { hasCustomers: false, planHadLiveVersions: true },
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
				state: { hasCustomers: false, planHadLiveVersions: true },
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
				state: { hasCustomers: false, planHadLiveVersions: true },
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
				state: { hasCustomers: false, planHadLiveVersions: true },
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
				state: { hasCustomers: false, planHadLiveVersions: true },
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

	test("base mint without propagate does not silently repoint variants", () => {
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
					active: true,
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
				state: { hasCustomers: false, planHadLiveVersions: true },
			} as UpsertProductPlan,
			projectedProductStatesContext: {
				...emptyStates({ planIds: ["team", "team-eu"] }),
				versionsByPlanId: {
					team: [newBase, oldBase],
					"team-eu": [variant],
				},
			},
		});

		expect(intents).toEqual([]);
	});

	test("base new_version without active mints variant as a draft", () => {
		const { intents } = mintVariantFromBase({ sourceActive: undefined });
		const mint = intents.find(
			(intent) =>
				intent.source === "variant_propagation" &&
				intent.planParams.versioning === "new_version",
		);
		expect(mint).toBeDefined();
		expect(mint?.planParams.active).toBeUndefined();
	});

	test("base new_version with active:true mints variant as active", () => {
		const { intents } = mintVariantFromBase({ sourceActive: true });
		const mint = intents.find(
			(intent) =>
				intent.source === "variant_propagation" &&
				intent.planParams.versioning === "new_version",
		);
		expect(mint).toBeDefined();
		expect(mint?.planParams.active).toBe(true);
	});

	test("processor change fans out to latest variant", () => {
		const current = {
			...baseProduct,
			processor: { type: "stripe", id: "prod_old" },
		};
		const next = {
			...baseProduct,
			processor: { type: "stripe", id: "prod_new" },
		};
		const variant = {
			...baseProduct,
			id: "team-eu",
			internal_id: "internal_team-eu",
			base_internal_product_id: baseProduct.internal_id,
			processor: { type: "stripe", id: "prod_old" },
		};

		const intents = deriveVariantIntents({
			intent: {
				productKey: { planId: "team", version: 1 },
				planParams: {
					plan_id: "team",
					version: 1,
					processors: { stripe: { product_id: "prod_new" } },
				},
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
				state: { hasCustomers: false, planHadLiveVersions: true },
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
		expect(intents[0]?.planParams.processors).toEqual({
			stripe: { product_id: "prod_new" },
		});
	});

	test("variants[].processors overrides base fan-out", () => {
		const current = {
			...baseProduct,
			processor: { type: "stripe", id: "prod_old" },
		};
		const next = {
			...baseProduct,
			processor: { type: "stripe", id: "prod_new" },
		};
		const variant = {
			...baseProduct,
			id: "team-eu",
			internal_id: "internal_team-eu",
			base_internal_product_id: baseProduct.internal_id,
			processor: { type: "stripe", id: "prod_old" },
		};

		const intents = deriveVariantIntents({
			intent: {
				productKey: { planId: "team", version: 1 },
				planParams: {
					plan_id: "team",
					version: 1,
					processors: { stripe: { product_id: "prod_new" } },
				},
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
				declaredVariants: [
					{
						variant_plan_id: "team-eu",
						processors: { stripe: { product_id: "prod_eu" } },
					},
				],
				state: { hasCustomers: false, planHadLiveVersions: true },
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
		expect(intents[0]?.planParams.processors).toEqual({
			stripe: { product_id: "prod_eu" },
		});
	});

	test("variant_link create copies variants[].processors onto planParams", () => {
		const next = {
			...baseProduct,
			processor: { type: "stripe", id: "prod_base" },
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
					currentFullProduct: next,
					baseFullProduct: null,
					nextFullProduct: next,
				},
				declaredVariants: [
					{
						variant_plan_id: "team-eu",
						name: "Team EU",
						processors: { stripe: { product_id: "prod_eu" } },
					},
				],
				state: { hasCustomers: false, planHadLiveVersions: true },
			} as UpsertProductPlan,
			projectedProductStatesContext: emptyStates({
				planIds: ["team", "team-eu"],
			}),
		});

		expect(intents).toHaveLength(1);
		expect(intents[0]?.source).toBe("variant_link");
		expect(intents[0]?.planParams.processors).toEqual({
			stripe: { product_id: "prod_eu" },
		});
	});
});

