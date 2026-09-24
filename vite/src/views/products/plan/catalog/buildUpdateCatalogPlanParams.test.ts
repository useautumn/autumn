import { describe, expect, test } from "bun:test";
import { AppEnv, type FrontendProduct } from "@autumn/shared";
import { buildCatalogUpdatePlans } from "./buildUpdateCatalogPlanParams";
import { resolveVariantRelationshipChange } from "./variantRelationshipChange";

const product = ({
	id,
	version,
	baseId,
}: {
	id: string;
	version: number;
	baseId?: string | null;
}): FrontendProduct => ({
	id,
	name: id,
	description: null,
	items: [],
	archived: false,
	created_at: 0,
	is_add_on: false,
	is_default: false,
	version,
	version_slug: `v${version}`,
	active: true,
	group: null,
	env: AppEnv.Sandbox,
	internal_id: `${id}_v${version}`,
	planType: "free",
	basePriceType: "recurring",
	...(baseId !== undefined ? { base_id: baseId } : {}),
});

const twoVersions = [{ version: 1 }, { version: 2 }];

describe("resolveVariantRelationshipChange", () => {
	test("an untouched picker is unchanged, even before versions load", () => {
		expect(
			resolveVariantRelationshipChange({
				editedBasePlanId: undefined,
				persistedBasePlanId: "team",
				selectedBaseVersion: 3,
				variantVersions: undefined,
			}),
		).toEqual({ kind: "unchanged" });
	});

	test("a moved picker with versions still loading throws instead of relinking part of the family", () => {
		expect(() =>
			resolveVariantRelationshipChange({
				editedBasePlanId: "team",
				persistedBasePlanId: null,
				selectedBaseVersion: 3,
				variantVersions: undefined,
			}),
		).toThrow(/still loading/);
	});

	test("a link without a resolvable base version throws", () => {
		expect(() =>
			resolveVariantRelationshipChange({
				editedBasePlanId: "team",
				persistedBasePlanId: null,
				selectedBaseVersion: undefined,
				variantVersions: twoVersions,
			}),
		).toThrow(/no version/);
	});
});

describe("buildCatalogUpdatePlans variant relationships", () => {
	const editedProduct = product({ id: "team-eu", version: 2 });
	const baseProduct = product({ id: "team-eu", version: 2 });

	test("link: every variant version nests under the one pinned base row", () => {
		expect(
			buildCatalogUpdatePlans({
				baseProduct,
				editedProduct,
				features: [],
				includeContent: false,
				relationship: {
					kind: "link",
					basePlanId: "team",
					baseVersion: 3,
					variantVersions: twoVersions,
				},
			}),
		).toEqual([
			{
				plan_id: "team",
				version: 3,
				variants: [
					{ variant_plan_id: "team-eu", version: 1 },
					{ variant_plan_id: "team-eu", version: 2 },
				],
			},
		]);
	});

	test("reparent is the same shape as link: the new base names every version", () => {
		const [nest] = buildCatalogUpdatePlans({
			baseProduct,
			editedProduct,
			features: [],
			includeContent: false,
			relationship: {
				kind: "link",
				basePlanId: "enterprise",
				baseVersion: 1,
				variantVersions: twoVersions,
			},
		});
		expect(nest).toEqual({
			plan_id: "enterprise",
			version: 1,
			variants: [
				{ variant_plan_id: "team-eu", version: 1 },
				{ variant_plan_id: "team-eu", version: 2 },
			],
		});
	});

	test("unlink: one explicit base_variant_id: null row per version", () => {
		expect(
			buildCatalogUpdatePlans({
				baseProduct,
				editedProduct,
				features: [],
				includeContent: false,
				relationship: { kind: "unlink", variantVersions: twoVersions },
			}),
		).toEqual([
			{ plan_id: "team-eu", version: 1, base_variant_id: null },
			{ plan_id: "team-eu", version: 2, base_variant_id: null },
		]);
	});

	test("unlink with a content edit states the edited version once, on the content row", () => {
		const plans = buildCatalogUpdatePlans({
			baseProduct,
			editedProduct,
			features: [],
			relationship: { kind: "unlink", variantVersions: twoVersions },
		});
		expect(plans.map(({ plan_id, version }) => ({ plan_id, version }))).toEqual(
			[
				{ plan_id: "team-eu", version: 1 },
				{ plan_id: "team-eu", version: 2 },
			],
		);
		expect(plans[0]).toEqual({
			plan_id: "team-eu",
			version: 1,
			base_variant_id: null,
		});
		expect(plans[1]).toMatchObject({ base_variant_id: null, name: "team-eu" });
	});

	test("content-only edit emits no relationship companion", () => {
		const plans = buildCatalogUpdatePlans({
			baseProduct,
			editedProduct,
			features: [],
		});
		expect(plans).toHaveLength(1);
		expect(plans[0]).toMatchObject({ plan_id: "team-eu", version: 2 });
		expect(plans[0]).not.toHaveProperty("base_variant_id");
		expect(plans[0]).not.toHaveProperty("variants");
	});
});
