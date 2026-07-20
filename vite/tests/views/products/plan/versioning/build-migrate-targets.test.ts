import { expect, test } from "bun:test";
import type {
	PlanUpdatePreview,
	PlanUpdatePreviewLicenseChange,
} from "@autumn/shared";
import { buildMigrateTargets } from "@/views/products/plan/versioning/MigrateTargetsStep";

test("carries base plan license changes into the review target", () => {
	const licenseChange = {
		license_plan_id: "team_seat",
		action: "update",
	} as PlanUpdatePreviewLicenseChange;
	const preview = {
		plan_id: "team",
		has_customers: true,
		customer_count: 1,
		license_changes: [licenseChange],
		variants: [],
		other_versions: [],
	} as PlanUpdatePreview;

	const targets = buildMigrateTargets({
		preview,
		selectedVariantIds: [],
		versionChoice: "new",
		currentVersion: 1,
		baseName: "Team Quarterly",
	});

	expect(targets[0].rows[0].licenseChanges).toEqual([licenseChange]);
});
