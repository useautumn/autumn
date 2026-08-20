import { describe, expect, test } from "bun:test";
import type { UpdateCatalogParams } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import { deriveDirectIntents } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/derive/deriveDirectIntents";
import { handleBasePlanLinkErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleBasePlanLinkErrors";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

const base = {
	...products.createFull({ id: "team" }),
	internal_id: "prod_team",
	base_internal_product_id: null,
};
const child = {
	...products.createFull({ id: "team-eu" }),
	internal_id: "prod_team_eu",
	base_internal_product_id: null,
};
const productStatesContext: ProductStatesContext = {
	statesByPlanVersion: {},
	versionsByPlanId: { team: [base], "team-eu": [child] },
	rewardProgramsByPlanId: {},
};
const params = (basePlanId: string | null): UpdateCatalogParams => ({
	features: [],
	remove_features: [],
	plans: [{ plan_id: "team-eu", base_plan_id: basePlanId }],
	remove_plans: [],
});

describe("catalog direct base plan links", () => {
	test("resolves the selected base plan to its internal product pointer", () => {
		const [intent] = deriveDirectIntents({
			params: params("team"),
			productStatesContext,
		});

		expect(intent?.baseInternalProductId).toBe(base.internal_id);
	});

	test("preserves explicit null for detach", () => {
		const [intent] = deriveDirectIntents({
			params: params(null),
			productStatesContext,
		});

		expect(intent?.baseInternalProductId).toBeNull();
	});

	test("rejects a missing or nested base plan", () => {
		expect(() =>
			handleBasePlanLinkErrors({
				params: params("missing"),
				productStatesContext,
			}),
		).toThrow("Invalid base plan: missing");

		expect(() =>
			handleBasePlanLinkErrors({
				params: params("team"),
				productStatesContext: {
					...productStatesContext,
					versionsByPlanId: {
						...productStatesContext.versionsByPlanId,
						team: [{ ...base, base_internal_product_id: "prod_parent" }],
					},
				},
			}),
		).toThrow("A variant plan cannot be used as a base plan.");
	});
});
