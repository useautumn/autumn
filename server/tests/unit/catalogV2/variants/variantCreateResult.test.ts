/**
 * `catalogV2.update` reports one `results.plans[]` entry per upsert row, so a
 * variant the config declares but the catalog lacks has to come back as a
 * `create` — a client backfilling stable ids reads that entry, not the
 * top-level `plans`, which carries direct rows only.
 */

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
import { upsertToCatalogAction } from "@/internal/catalogV2/actions/updateCatalog/utils/upsertToCatalogAction";
import { emptyVersioningFlags } from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";

const ctx = {
	env: AppEnv.Sandbox,
	features: [],
	org: {
		id: "org_test",
		planAliases: {},
		config: {},
		default_currency: "usd",
	},
} as unknown as AutumnContext;

const row = ({ planId, version }: { planId: string; version: number }) => ({
	...products.createFull({ id: planId }),
	entitlements: [],
	prices: [],
	free_trial: null,
	internal_id: `internal_${planId}_v${version}`,
	version,
	version_slug: `v${version}`,
	active: true,
	base_internal_product_id: null,
});

const statesFor = ({
	rows,
}: {
	rows: ReturnType<typeof row>[];
}): ProductStatesContext => {
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
	return {
		statesByPlanVersion,
		versionsByPlanId,
		rewardProgramsByPlanId: {},
	} as unknown as ProductStatesContext;
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
		invoiceCreditProducts: [],
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

const declaringPlan = [
	{
		plan_id: "pro",
		variants: [
			{
				variant_plan_id: "pro_yearly",
				name: "Pro Yearly",
				customize: { price: { amount: 200, interval: "year" } },
			},
		],
		propagate: { variants: [{ plan_id: "pro_yearly" }] },
	},
] as unknown as UpdateCatalogParams["plans"];

describe("applied result for a declared variant", () => {
	test("a variant the catalog lacks is reported as a create", () => {
		const upserts = runCompute({
			rows: [row({ planId: "pro", version: 1 })],
			plans: declaringPlan,
		});

		const variant = upserts.find(
			(upsert) => upsert.row.planId === "pro_yearly",
		);
		expect(variant?.row.source).toBe("variant_link");
		expect(variant?.row.op).toBe("create");
		expect(
			upsertToCatalogAction({ upsert: variant as UpsertProductPlan }),
		).toBe("create");
	});

	test("the unchanged base beside it stays a none", () => {
		const upserts = runCompute({
			rows: [row({ planId: "pro", version: 1 })],
			plans: declaringPlan,
		});

		const base = upserts.find((upsert) => upsert.row.planId === "pro");
		expect(upsertToCatalogAction({ upsert: base as UpsertProductPlan })).toBe(
			"none",
		);
	});
});
