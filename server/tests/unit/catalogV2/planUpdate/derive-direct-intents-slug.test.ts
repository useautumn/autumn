import { describe, expect, test } from "bun:test";
import { products } from "@tests/utils/fixtures/db/products";
import { deriveDirectIntents } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/derive/deriveDirectIntents";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

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
				skip_deletions: true,
				skip_plan_ids: [],
				skip_feature_ids: [],
			},
			productStatesContext,
			internalIdRefs: new Map(),
		});
		expect(intent?.productKey).toEqual({ planId: "pro", version: 1 });
	});

	test("unknown version_slug mints under that name, never the active row", () => {
		const [intent] = deriveDirectIntents({
			params: {
				plans: [{ plan_id: "pro", version_slug: "missing", name: "Ghost" }],
				features: [],
				remove_features: [],
				remove_plans: [],
				skip_deletions: true,
				skip_plan_ids: [],
				skip_feature_ids: [],
			},
			productStatesContext,
			internalIdRefs: new Map(),
		});

		// A config states the history it wants, so a slug naming no row creates
		// one. The original guarantee still holds: it must never land on the
		// active row (v2 here), which would silently rewrite live pricing.
		expect(intent?.productKey).toEqual({ planId: "pro", version: 3 });
		expect(intent?.planParams.new_version_slug).toBe("missing");
		expect(intent?.planParams.version_slug).toBeUndefined();
	});

	test("two entries minting distinct slugs get distinct versions", () => {
		const intents = deriveDirectIntents({
			params: {
				plans: [
					{ plan_id: "pro", version_slug: "autumn", name: "A" },
					{ plan_id: "pro", version_slug: "winter", name: "B" },
				],
				features: [],
				remove_features: [],
				remove_plans: [],
				skip_deletions: true,
				skip_plan_ids: [],
				skip_feature_ids: [],
			},
			productStatesContext,
			internalIdRefs: new Map(),
		});

		expect(intents.map((intent) => intent.productKey.version)).toEqual([3, 4]);
	});

	test("omit both targets the active row", () => {
		const [intent] = deriveDirectIntents({
			params: {
				plans: [{ plan_id: "pro", name: "Active" }],
				features: [],
				remove_features: [],
				remove_plans: [],
				skip_deletions: true,
				skip_plan_ids: [],
				skip_feature_ids: [],
			},
			productStatesContext,
			internalIdRefs: new Map(),
		});
		expect(intent?.productKey).toEqual({ planId: "pro", version: 2 });
	});

	test("no live versions mints the next free version", () => {
		const [intent] = deriveDirectIntents({
			params: {
				plans: [{ plan_id: "pro", name: "Reborn" }],
				features: [],
				remove_features: [],
				remove_plans: [],
				skip_deletions: true,
				skip_plan_ids: [],
				skip_feature_ids: [],
			},
			productStatesContext: {
				statesByPlanVersion: {},
				versionsByPlanId: { pro: [] },
				maxVersionByPlanId: { pro: 2 },
				rewardProgramsByPlanId: {},
			},
			internalIdRefs: new Map(),
		});
		expect(intent?.productKey).toEqual({ planId: "pro", version: 3 });
	});
});
