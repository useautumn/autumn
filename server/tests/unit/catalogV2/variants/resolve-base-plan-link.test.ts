import { describe, expect, test } from "bun:test";
import { products } from "@tests/utils/fixtures/db/products";
import { resolveBasePlanLink } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeVariantPlan/resolveBasePlanLink";
import { deriveVersionSiblingIntents } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/derive/deriveVersionSiblingIntents";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

const fullProduct = ({
	id,
	version = 1,
	baseInternalProductId = null,
}: {
	id: string;
	version?: number;
	baseInternalProductId?: string | null;
}) => ({
	...products.createFull({ id }),
	internal_id: `internal_${id}_v${version}`,
	version,
	base_internal_product_id: baseInternalProductId,
	entitlements: [],
	prices: [],
	free_trial: null,
});

const monthly = fullProduct({ id: "individual" });
const monthlyV2 = fullProduct({ id: "individual", version: 2 });
const yearly = fullProduct({ id: "individual-yearly" });

const statesContext = ({
	versionsByPlanId,
}: {
	versionsByPlanId: ProductStatesContext["versionsByPlanId"];
}): ProductStatesContext => ({
	statesByPlanVersion: {},
	versionsByPlanId,
	rewardProgramsByPlanId: {},
});

const directIntent = ({
	basePlanId,
}: {
	basePlanId?: string | null;
}): ProductUpsertIntent => ({
	productKey: { planId: "individual-yearly", version: 1 },
	planParams: {
		plan_id: "individual-yearly",
		version: 1,
		...(basePlanId !== undefined ? { base_plan_id: basePlanId } : {}),
	},
	source: "direct",
});

describe("resolveBasePlanLink", () => {
	const context = statesContext({
		versionsByPlanId: {
			individual: [monthlyV2, monthly],
			"individual-yearly": [yearly],
		},
	});

	test("resolves base_plan_id to the latest base row", () => {
		expect(
			resolveBasePlanLink({
				intent: directIntent({ basePlanId: "individual" }),
				currentFullProduct: yearly,
				productStatesContext: context,
			}),
		).toBe(monthlyV2.internal_id);
	});

	test("null detaches and an omitted field leaves the pointer alone", () => {
		expect(
			resolveBasePlanLink({
				intent: directIntent({ basePlanId: null }),
				currentFullProduct: yearly,
				productStatesContext: context,
			}),
		).toBeNull();
		expect(
			resolveBasePlanLink({
				intent: directIntent({}),
				currentFullProduct: yearly,
				productStatesContext: context,
			}),
		).toBeUndefined();
	});

	test("an unknown base resolves to undefined for the error guard to reject", () => {
		expect(
			resolveBasePlanLink({
				intent: directIntent({ basePlanId: "ghost" }),
				currentFullProduct: yearly,
				productStatesContext: context,
			}),
		).toBeUndefined();
	});

	test("an inherited sibling write wins over base_plan_id", () => {
		expect(
			resolveBasePlanLink({
				intent: {
					...directIntent({ basePlanId: "individual" }),
					source: "repoint",
					basePlanLink: null,
				},
				currentFullProduct: yearly,
				productStatesContext: context,
			}),
		).toBeNull();
	});
});

describe("deriveVersionSiblingIntents", () => {
	const yearlyV2 = fullProduct({ id: "individual-yearly", version: 2 });
	const context = statesContext({
		versionsByPlanId: {
			individual: [monthly],
			"individual-yearly": [yearlyV2, yearly],
		},
	});

	test("a link fans a repoint out over the plan's other version rows", () => {
		const intents = deriveVersionSiblingIntents({
			intent: {
				productKey: { planId: "individual-yearly", version: 2 },
				planParams: {
					plan_id: "individual-yearly",
					version: 2,
					base_plan_id: "individual",
				},
				source: "direct",
			},
			upsert: {
				row: {
					planId: "individual-yearly",
					version: 2,
					op: "update",
					source: "direct",
					versioning: "existing",
					currentFullProduct: yearlyV2,
					baseFullProduct: null,
					nextFullProduct: yearlyV2,
				},
				basePlanLink: monthly.internal_id,
				state: { hasCustomers: false },
			} as UpsertProductPlan,
			projectedProductStatesContext: context,
		});

		expect(intents).toHaveLength(1);
		expect(intents[0]?.source).toBe("repoint");
		expect(intents[0]?.productKey.version).toBe(1);
		expect(intents[0]?.basePlanLink).toBe(monthly.internal_id);
	});

	test("no pointer write and no all_versions emits nothing", () => {
		const intents = deriveVersionSiblingIntents({
			intent: {
				productKey: { planId: "individual-yearly", version: 2 },
				planParams: { plan_id: "individual-yearly", version: 2 },
				source: "direct",
			},
			upsert: {
				row: {
					planId: "individual-yearly",
					version: 2,
					op: "update",
					source: "direct",
					versioning: "existing",
					currentFullProduct: yearlyV2,
					baseFullProduct: null,
					nextFullProduct: yearlyV2,
				},
				state: { hasCustomers: false },
			} as UpsertProductPlan,
			projectedProductStatesContext: context,
		});

		expect(intents).toEqual([]);
	});
});
