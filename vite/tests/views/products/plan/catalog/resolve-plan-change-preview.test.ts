import { describe, expect, test } from "bun:test";
import type { CatalogPlanUpdatePreview } from "@autumn/shared";
import {
	resolveEffectiveVersionChoice,
	resolvePlanChangePreview,
	resolveVersioningOptionVisibility,
} from "@/views/products/plan/catalog/resolvePlanChangePreview";

const planPreview = (
	overrides: Partial<CatalogPlanUpdatePreview> = {},
): CatalogPlanUpdatePreview =>
	({
		plan_id: "pro",
		version: 1,
		action: "update",
		state: { has_customers: false, will_archive: false },
		plan_change: { item_changes: [], customize: { items: [] } },
		versioning: {
			current_version: 1,
			new_version: 2,
			resolved: "existing",
			options: ["existing", "new_version"],
		},
		...overrides,
	}) as CatalogPlanUpdatePreview;

describe("resolvePlanChangePreview", () => {
	test("falls back to update when new_version is not offered", () => {
		expect(
			resolveEffectiveVersionChoice({
				choice: "new",
				showNewOption: false,
				showAllOption: true,
			}),
		).toBe("update");
		expect(
			resolveEffectiveVersionChoice({
				choice: "all",
				showNewOption: true,
				showAllOption: false,
			}),
		).toBe("update");
	});

	test("hides all_versions when the change has license parents", () => {
		expect(
			resolveVersioningOptionVisibility({
				options: ["existing", "new_version", "all_versions"],
				isLatest: true,
				hasLicenseChanges: false,
				licenseParentCount: 1,
			}).showAllOption,
		).toBe(false);
	});

	test("builds propagate from the discover preview, not from later scoped results", () => {
		const preview = planPreview({
			variants: [
				{
					plan_id: "pro_eu",
					version: 1,
					state: { has_customers: true, will_archive: false },
					conflicts: [],
				},
			],
			license_parents: [
				{
					plan_id: "team",
					name: "Team",
					version: 2,
					state: { has_customers: true, will_archive: false },
					conflicts: [],
				},
			],
		});

		const model = resolvePlanChangePreview({
			preview,
			versionChoice: "new",
			variantSelection: ["pro_eu"],
			licenseParentSelection: ["team@2"],
			isLatest: true,
			namesByPlanId: { pro_eu: "Pro EU" },
		});

		expect(model.showLicenseParentScope).toBe(true);
		expect(model.showVariantScope).toBe(true);
		expect(model.propagate).toEqual({
			variants: [{ plan_id: "pro_eu" }],
			license_parents: [{ plan_id: "team", version: 2 }],
		});
		expect(model.strategy).toBe("new_version");
	});

	test("does not send variant propagate when variant scope is hidden", () => {
		const preview = planPreview({
			versioning: {
				current_version: 1,
				new_version: null,
				resolved: "existing",
				options: ["existing"],
			},
			variants: [
				{
					plan_id: "pro_eu",
					version: 1,
					state: { has_customers: false, will_archive: false },
					conflicts: [],
				},
			],
		});

		const model = resolvePlanChangePreview({
			preview,
			versionChoice: "new",
			variantSelection: ["pro_eu"],
			licenseParentSelection: null,
			isLatest: false,
			namesByPlanId: { pro_eu: "Pro EU" },
		});

		expect(model.effectiveVersionChoice).toBe("update");
		expect(model.showVariantScope).toBe(false);
		expect(model.propagate).toBeUndefined();
	});
});
