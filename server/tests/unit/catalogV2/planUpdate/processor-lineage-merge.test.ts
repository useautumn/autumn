import { describe, expect, test } from "bun:test";
import { AppEnv, type UpdateCatalogParams } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeUpsertProductsPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeUpsertProductsPlan";
import type {
	ProductStatesContext,
	UpdateCatalogContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { emptyVersioningFlags } from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";

const ctx = {
	env: AppEnv.Sandbox,
	features: [],
	org: { id: "org_test", planAliases: {} },
} as unknown as AutumnContext;

const row = ({
	planId,
	version,
	stripeProductId,
	active = true,
	baseInternalProductId = null,
}: {
	planId: string;
	version: number;
	stripeProductId: string | null;
	active?: boolean;
	baseInternalProductId?: string | null;
}) => ({
	...products.createFull({ id: planId }),
	entitlements: [],
	prices: [],
	free_trial: null,
	internal_id: `internal_${planId}_v${version}`,
	version,
	version_slug: `v${version}`,
	active,
	processor: stripeProductId ? { type: "stripe", id: stripeProductId } : null,
	base_internal_product_id: baseInternalProductId,
});

const statesFor = ({ rows }: { rows: ReturnType<typeof row>[] }) => {
	const versionsByPlanId: Record<string, ReturnType<typeof row>[]> = {};
	const statesByPlanVersion: ProductStatesContext["statesByPlanVersion"] = {};
	for (const product of rows) {
		versionsByPlanId[product.id] = [
			...(versionsByPlanId[product.id] ?? []),
			product,
		];
		statesByPlanVersion[`${product.id}@${product.version}`] = {
			productKey: { planId: product.id, version: product.version },
			currentFullProduct: product,
			customerUsage: emptyVersioningFlags(),
		};
	}
	for (const planId of Object.keys(versionsByPlanId)) {
		versionsByPlanId[planId]?.sort((a, b) => b.version - a.version);
	}
	return { statesByPlanVersion, versionsByPlanId, rewardProgramsByPlanId: {} };
};

const runCompute = ({
	rows,
	plans,
}: {
	rows: ReturnType<typeof row>[];
	plans: UpdateCatalogParams["plans"];
}): UpsertProductPlan[] => {
	const catalogContext = {
		featureStatesContext: {},
		productStatesContext: statesFor({ rows }),
		licenseStatesContext: { referencedPlanLicenseIds: new Set<string>() },
	} as unknown as UpdateCatalogContext;

	const { upsertProducts } = computeUpsertProductsPlan({
		ctx,
		catalogContext,
		params: {
			plans,
			features: [],
			remove_features: [],
			remove_plans: [],
		} as unknown as UpdateCatalogParams,
	});

	return upsertProducts ?? [];
};

const stripeIdFor = ({
	upserts,
	planId,
	version,
}: {
	upserts: UpsertProductPlan[];
	planId: string;
	version: number;
}) => {
	const match = upserts.find(
		(upsert) => upsert.row.planId === planId && upsert.row.version === version,
	);
	expect(match, `no upsert row for ${planId}@${version}`).toBeDefined();
	return match?.row.nextFullProduct.processor?.id ?? null;
};

describe("processors merge across a plan lineage", () => {
	test("sibling version named in the same payload adopts the stated mapping", () => {
		const upserts = runCompute({
			rows: [
				row({
					planId: "pro",
					version: 1,
					stripeProductId: "prod_old",
					active: false,
				}),
				row({ planId: "pro", version: 2, stripeProductId: "prod_old" }),
			],
			plans: [
				{
					plan_id: "pro",
					version: 1,
					processors: { stripe: { product_id: "prod_new" } },
				},
				{ plan_id: "pro", version: 2, description: "unrelated edit" },
			],
		});

		expect(stripeIdFor({ upserts, planId: "pro", version: 1 })).toBe(
			"prod_new",
		);
		expect(stripeIdFor({ upserts, planId: "pro", version: 2 })).toBe(
			"prod_new",
		);
	});

	test("variant named in the same payload adopts the base's stated mapping", () => {
		const base = row({
			planId: "pro",
			version: 1,
			stripeProductId: "prod_old",
		});
		const upserts = runCompute({
			rows: [
				base,
				row({
					planId: "pro-eu",
					version: 1,
					stripeProductId: "prod_old",
					baseInternalProductId: base.internal_id,
				}),
			],
			plans: [
				{
					plan_id: "pro",
					processors: { stripe: { product_id: "prod_new" } },
				},
				{ plan_id: "pro-eu", description: "unrelated edit" },
			],
		});

		expect(stripeIdFor({ upserts, planId: "pro", version: 1 })).toBe(
			"prod_new",
		);
		expect(stripeIdFor({ upserts, planId: "pro-eu", version: 1 })).toBe(
			"prod_new",
		);
	});

	test("a stated unlink clears the whole lineage, not just the named row", () => {
		const base = row({
			planId: "pro",
			version: 1,
			stripeProductId: "prod_old",
			active: false,
		});
		const upserts = runCompute({
			rows: [
				base,
				row({ planId: "pro", version: 2, stripeProductId: "prod_old" }),
				row({
					planId: "pro-eu",
					version: 1,
					stripeProductId: "prod_old",
					baseInternalProductId: base.internal_id,
				}),
			],
			plans: [
				{ plan_id: "pro", version: 1, processors: { stripe: null } },
				{ plan_id: "pro", version: 2, description: "unrelated edit" },
				{ plan_id: "pro-eu", description: "unrelated edit" },
			],
		});

		expect(stripeIdFor({ upserts, planId: "pro", version: 1 })).toBeNull();
		expect(stripeIdFor({ upserts, planId: "pro", version: 2 })).toBeNull();
		expect(stripeIdFor({ upserts, planId: "pro-eu", version: 1 })).toBeNull();
	});

	test("a variant stating its own mapping keeps it", () => {
		const base = row({
			planId: "pro",
			version: 1,
			stripeProductId: "prod_old",
		});
		const upserts = runCompute({
			rows: [
				base,
				row({
					planId: "pro-eu",
					version: 1,
					stripeProductId: "prod_old",
					baseInternalProductId: base.internal_id,
				}),
			],
			plans: [
				{
					plan_id: "pro",
					processors: { stripe: { product_id: "prod_new" } },
				},
				{
					plan_id: "pro-eu",
					processors: { stripe: { product_id: "prod_eu" } },
				},
			],
		});

		expect(stripeIdFor({ upserts, planId: "pro", version: 1 })).toBe(
			"prod_new",
		);
		expect(stripeIdFor({ upserts, planId: "pro-eu", version: 1 })).toBe(
			"prod_eu",
		);
	});

	test("variants[] override beats the base's fan-out for a directly named variant", () => {
		const base = row({
			planId: "pro",
			version: 1,
			stripeProductId: "prod_old",
		});
		const upserts = runCompute({
			rows: [
				base,
				row({
					planId: "pro-eu",
					version: 1,
					stripeProductId: "prod_old",
					baseInternalProductId: base.internal_id,
				}),
			],
			plans: [
				{
					plan_id: "pro",
					processors: { stripe: { product_id: "prod_new" } },
					variants: [
						{
							variant_plan_id: "pro-eu",
							processors: { stripe: { product_id: "prod_eu" } },
						},
					],
				},
				{ plan_id: "pro-eu", description: "unrelated edit" },
			],
		});

		expect(stripeIdFor({ upserts, planId: "pro-eu", version: 1 })).toBe(
			"prod_eu",
		);
	});

	test("two entries stating different mappings for one plan is a 400", () => {
		expect(() =>
			runCompute({
				rows: [
					row({
						planId: "pro",
						version: 1,
						stripeProductId: "prod_old",
						active: false,
					}),
					row({ planId: "pro", version: 2, stripeProductId: "prod_old" }),
				],
				plans: [
					{
						plan_id: "pro",
						version: 1,
						processors: { stripe: { product_id: "prod_a" } },
					},
					{
						plan_id: "pro",
						version: 2,
						processors: { stripe: { product_id: "prod_b" } },
					},
				],
			}),
		).toThrow(/plan_id=pro/);
	});
});
