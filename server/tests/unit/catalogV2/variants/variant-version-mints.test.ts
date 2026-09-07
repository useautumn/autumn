import { describe, expect, test } from "bun:test";
import { BillingInterval, type UpdateCatalogParams } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import { deriveVariantIntents } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/derive/deriveVariantIntents";
import { handleUpsertProductVersioningErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductVersioningErrors";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

const emptyStates = ({
	planIds,
}: {
	planIds: string[];
}): ProductStatesContext => ({
	statesByPlanVersion: {},
	versionsByPlanId: Object.fromEntries(planIds.map((planId) => [planId, []])),
	rewardProgramsByPlanId: {},
});

const bareProduct = {
	...products.createFull({ id: "team" }),
	entitlements: [],
	prices: [],
	free_trial: null,
};

const teamV1 = {
	...bareProduct,
	internal_id: "internal_team_v1",
	version: 1,
	version_slug: "v1",
	active: false,
};
const teamV2 = {
	...bareProduct,
	internal_id: "internal_team_v2",
	version: 2,
	version_slug: "v2",
	active: true,
};
const teamEuV1 = {
	...bareProduct,
	id: "team-eu",
	name: "Team EU",
	internal_id: "internal_team-eu_v1",
	version: 1,
	version_slug: "v1",
	active: true,
	base_internal_product_id: teamV1.internal_id,
};

/** The new base row is a from-scratch create: no clone source, so no baseFullProduct. */
const newBaseUpsert = ({
	declaredVariants,
}: {
	declaredVariants: UpsertProductPlan["declaredVariants"];
}): UpsertProductPlan =>
	({
		row: {
			planId: "team",
			version: 2,
			op: "create",
			source: "direct",
			versioning: "existing",
			currentFullProduct: null,
			baseFullProduct: null,
			nextFullProduct: teamV2,
		},
		declaredVariants,
		propagate: { variants: [{ plan_id: "team-eu", version_slug: "v2" }] },
		state: { hasCustomers: false, planHadLiveVersions: true },
	}) as UpsertProductPlan;

const statesWithTeamEu = (): ProductStatesContext => ({
	...emptyStates({ planIds: ["team", "team-eu"] }),
	versionsByPlanId: {
		team: [teamV2, teamV1],
		"team-eu": [teamEuV1],
	},
});

describe("variants[] naming a version the catalog does not have", () => {
	test("an unresolved slug on a plan with rows mints the next version under the new base", () => {
		const intents = deriveVariantIntents({
			intent: {
				productKey: { planId: "team", version: 2 },
				planParams: { plan_id: "team", version: 2, active: true },
				source: "direct",
			},
			upsert: newBaseUpsert({
				declaredVariants: [
					{
						variant_plan_id: "team-eu",
						version_slug: "v2",
						customize: {
							price: { amount: 250, interval: BillingInterval.Year },
						},
					},
				],
			}),
			projectedProductStatesContext: statesWithTeamEu(),
		});

		expect(intents).toHaveLength(1);
		const [mint] = intents;
		expect(mint.source).toBe("variant_link");
		expect(mint.productKey).toEqual({ planId: "team-eu", version: 2 });
		expect(mint.planParams.new_version_slug).toBe("v2");
		expect(mint.baseInternalProductId).toBe(teamV2.internal_id);
		// Silent entry keys inherit from the variant plan's latest row / the base.
		expect(mint.planParams.name).toBe("Team EU");
		expect(mint.planParams.active).toBe(true);
	});

	test("a minted version under an inactive base row does not take active", () => {
		const upsert = newBaseUpsert({
			declaredVariants: [{ variant_plan_id: "team-eu", version_slug: "v3" }],
		});
		const intents = deriveVariantIntents({
			intent: {
				productKey: { planId: "team", version: 2 },
				planParams: { plan_id: "team", version: 2 },
				source: "direct",
			},
			upsert: {
				...upsert,
				row: {
					...upsert.row,
					nextFullProduct: { ...teamV2, active: false },
				},
			},
			projectedProductStatesContext: statesWithTeamEu(),
		});

		expect(intents).toHaveLength(1);
		expect(intents[0]?.planParams.active).toBe(false);
	});

	test("a slug that names an existing row is an edit, not a mint", () => {
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
					currentFullProduct: teamV1,
					baseFullProduct: null,
					nextFullProduct: teamV1,
				},
				declaredVariants: [{ variant_plan_id: "team-eu", version_slug: "v1" }],
				state: { hasCustomers: false, planHadLiveVersions: true },
			} as UpsertProductPlan,
			projectedProductStatesContext: statesWithTeamEu(),
		});

		expect(
			intents.filter((intent) => intent.source === "variant_link"),
		).toHaveLength(0);
	});

	test("a plan with no rows still creates v1, under the stated slug", () => {
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
					currentFullProduct: teamV1,
					baseFullProduct: null,
					nextFullProduct: teamV1,
				},
				declaredVariants: [
					{
						variant_plan_id: "team-eu",
						name: "Team EU",
						version_slug: "beta",
					},
				],
				state: { hasCustomers: false, planHadLiveVersions: true },
			} as UpsertProductPlan,
			projectedProductStatesContext: emptyStates({
				planIds: ["team", "team-eu"],
			}),
		});

		expect(intents).toHaveLength(1);
		expect(intents[0]?.productKey).toEqual({ planId: "team-eu", version: 1 });
		expect(intents[0]?.planParams.new_version_slug).toBe("beta");
	});
});

describe("propagate.variants pinning a slug this push mints", () => {
	const paramsWithVariantSlug = ({
		variantSlug,
		propagateSlug,
	}: {
		variantSlug: string;
		propagateSlug: string;
	}): UpdateCatalogParams =>
		({
			plans: [
				{
					plan_id: "team",
					name: "Team",
					version_slug: "v2",
					active: true,
					variants: [{ variant_plan_id: "team-eu", version_slug: variantSlug }],
					propagate: {
						variants: [{ plan_id: "team-eu", version_slug: propagateSlug }],
					},
				},
			],
		}) as UpdateCatalogParams;

	test("passes when a variants[] entry mints that slug", () => {
		expect(() =>
			handleUpsertProductVersioningErrors({
				params: paramsWithVariantSlug({
					variantSlug: "v2",
					propagateSlug: "v2",
				}),
				productStatesContext: statesWithTeamEu(),
			}),
		).not.toThrow();
	});

	test("still rejects a slug nothing in the push mints", () => {
		expect(() =>
			handleUpsertProductVersioningErrors({
				params: paramsWithVariantSlug({
					variantSlug: "v2",
					propagateSlug: "v9",
				}),
				productStatesContext: statesWithTeamEu(),
			}),
		).toThrow(/Unknown version_slug "v9" for plan_id=team-eu/);
	});
});
