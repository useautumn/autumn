import { expect, test } from "bun:test";
import type { FullProduct } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { buildProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/buildProductStatesContext";
import { projectPlanWideRenames } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/projectPlanWideRenames";

test("renaming one version re-keys its untouched sibling versions", () => {
	const v1 = { ...products.createFull({ id: "seat" }), internal_id: "seat_v1" };
	const v2: FullProduct = {
		...products.createFull({ id: "seat" }),
		internal_id: "seat_v2",
		version: 2,
		version_slug: "v2",
	};
	const renamedV2 = { ...v2, id: "seatNew" };
	const upsert = {
		row: {
			planId: "seat",
			version: 2,
			op: "update",
			source: "direct",
			versioning: "existing",
			currentFullProduct: v2,
			baseFullProduct: null,
			nextFullProduct: renamedV2,
		},
		state: { hasCustomers: false, planHadLiveVersions: true },
	} as UpsertProductPlan;

	const projected = projectPlanWideRenames({
		productStatesContext: buildProductStatesContext({
			planIds: ["seat", "seatNew"],
			versionsByPlanId: new Map([
				["seat", [v1]],
				["seatNew", [renamedV2]],
			]),
			usageByInternalId: new Map(),
			rewardProgramsByPlanId: new Map(),
		}),
		upsertProducts: [upsert],
	});

	expect(
		projected.versionsByPlanId.seatNew?.map((row) => [row.id, row.internal_id]),
	).toEqual([
		["seatNew", "seat_v2"],
		["seatNew", "seat_v1"],
	]);
	expect(projected.versionsByPlanId.seat).toEqual([]);
});
