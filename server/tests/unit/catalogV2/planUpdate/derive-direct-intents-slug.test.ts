import { describe, expect, test } from "bun:test";
import { deriveDirectIntents } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/derive/deriveDirectIntents";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { products } from "@tests/utils/fixtures/db/products";

const v1 = {
	...products.createFull({ id: "pro" }),
	internal_id: "internal_pro_v1",
	version: 1,
	version_slug: "v1",
	active: false,
};
const v2 = {
	...products.createFull({ id: "pro" }),
	internal_id: "internal_pro_v2",
	version: 2,
	version_slug: "summer",
	active: true,
};

const productStatesContext: ProductStatesContext = {
	statesByPlanVersion: {},
	versionsByPlanId: { pro: [v2, v1] },
	rewardProgramsByPlanId: {},
};

describe("deriveDirectIntents version_slug targeting", () => {
	test("version_slug resolves to that row, not the active pointer", () => {
		const [intent] = deriveDirectIntents({
			params: {
				plans: [{ plan_id: "pro", version_slug: "v1", name: "Pinned" }],
				features: [],
				remove_features: [],
				remove_plans: [],
			},
			productStatesContext,
		});
		expect(intent?.productKey).toEqual({ planId: "pro", version: 1 });
	});

	test("unknown version_slug is not fall-through-to-active", () => {
		expect(
			deriveDirectIntents({
				params: {
					plans: [{ plan_id: "pro", version_slug: "missing", name: "Ghost" }],
					features: [],
					remove_features: [],
					remove_plans: [],
				},
				productStatesContext,
			}),
		).toEqual([]);
	});

	test("omit both targets the active row", () => {
		const [intent] = deriveDirectIntents({
			params: {
				plans: [{ plan_id: "pro", name: "Active" }],
				features: [],
				remove_features: [],
				remove_plans: [],
			},
			productStatesContext,
		});
		expect(intent?.productKey).toEqual({ planId: "pro", version: 2 });
	});
});
