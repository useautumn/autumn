import { describe, expect, test } from "bun:test";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { upsertToCatalogAction } from "@/internal/catalogV2/actions/updateCatalog/utils/upsertToCatalogAction";

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
