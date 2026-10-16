/**
 * Catalog actions are scoped to the catalog before the request starts.
 * Red: a fresh plan's second version is labeled update; green: both are create.
 */

import { describe, expect, test } from "bun:test";
import { AppEnv, type UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeUpsertProductsPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeUpsertProductsPlan";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { upsertToCatalogAction } from "@/internal/catalogV2/actions/updateCatalog/utils/upsertToCatalogAction";

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

const upsertWith = ({
	op,
	planHadLiveVersions,
}: {
	op: UpsertProductPlan["row"]["op"];
	planHadLiveVersions: boolean;
}) =>
	({
		row: { op },
		state: { hasCustomers: false, planHadLiveVersions },
	}) as UpsertProductPlan;

describe("upsertToCatalogAction", () => {
	test("minting a version of a live plan is an update, not a create", () => {
		expect(
			upsertToCatalogAction({
				upsert: upsertWith({ op: "create", planHadLiveVersions: true }),
			}),
		).toBe("update");
	});

	test("create means the plan_id had no live version", () => {
		expect(
			upsertToCatalogAction({
				upsert: upsertWith({ op: "create", planHadLiveVersions: false }),
			}),
		).toBe("create");
	});

	test("an in-place edit stays an update", () => {
		expect(
			upsertToCatalogAction({
				upsert: upsertWith({ op: "update", planHadLiveVersions: true }),
			}),
		).toBe("update");
	});

	test("a no-op row reports none regardless of plan history", () => {
		expect(
			upsertToCatalogAction({
				upsert: upsertWith({ op: "none", planHadLiveVersions: true }),
			}),
		).toBe("none");
	});
});

test("every version of a plan absent before the request is a create", () => {
	const catalogContext = {
		internalIdRefs: new Map(),
		featureStatesContext: {},
		productStatesContext: {
			statesByPlanVersion: {},
			versionsByPlanId: {},
			rewardProgramsByPlanId: {},
		},
		licenseStatesContext: { referencedPlanLicenseIds: new Set<string>() },
	} as unknown as UpdateCatalogContext;
	const params = {
		plans: [
			{
				plan_id: "pro",
				internal_id: "prod_pro_v2",
				version_slug: "v2",
				name: "Pro v2",
				active: true,
			},
			{
				plan_id: "pro",
				internal_id: "prod_pro_v1",
				version_slug: "v1",
				name: "Pro v1",
				active: false,
			},
		],
		features: [],
		remove_features: [],
		remove_plans: [],
	} as unknown as UpdateCatalogParams;

	const { upsertProducts } = computeUpsertProductsPlan({
		ctx,
		catalogContext,
		params,
	});
	expect(upsertProducts).toBeDefined();
	const actions = (upsertProducts ?? [])
		.filter((upsert) => upsert.row.source === "direct")
		.map((upsert) => upsertToCatalogAction({ upsert }));

	expect(actions).toEqual(["create", "create"]);
});
