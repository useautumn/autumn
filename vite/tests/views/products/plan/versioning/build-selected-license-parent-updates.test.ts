import { describe, expect, test } from "bun:test";
import type { PlanUpdatePreview } from "@autumn/shared";
import {
	buildSelectedLicenseParentUpdates,
	getLicenseParentTargetId,
} from "@/views/products/plan/versioning/buildMigrateTargets";

const parent = {
	plan_id: "enterprise",
	version: 2,
} as PlanUpdatePreview["license_parents"][number];

describe("buildSelectedLicenseParentUpdates", () => {
	test("sends an explicit empty list when the parent is unselected", () => {
		expect(
			buildSelectedLicenseParentUpdates({ parents: [parent], selectedIds: [] }),
		).toEqual([]);
	});

	test("includes only selected parent versions", () => {
		expect(
			buildSelectedLicenseParentUpdates({
				parents: [parent],
				selectedIds: [getLicenseParentTargetId(parent)],
			}),
		).toEqual([{ plan_id: "enterprise", version: 2 }]);
	});
});
