import { describe, expect, test } from "bun:test";
import type {
	CatalogLicenseParentPreview,
	CatalogPlanUpdatePreview,
} from "@autumn/shared";
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

	test("a metadata-only save edits its row instead of minting a version", () => {
		expect(
			resolveEffectiveVersionChoice({
				choice: "new",
				showNewOption: true,
				showAllOption: true,
				isMetadataOnly: true,
			}),
		).toBe("update");

		const model = resolvePlanChangePreview({
			preview: planPreview({
				state: { has_customers: true, will_archive: false },
				plan_change: { item_changes: [] },
				version_slug: "v1",
				new_version_slug: "launch",
			} as Partial<CatalogPlanUpdatePreview>),
			versionChoice: "new",
			variantSelection: null,
			licenseParentSelection: null,
			isLatest: true,
			namesByPlanId: {},
		});

		expect(model.isMetadataOnly).toBe(true);
		expect(model.effectiveVersionChoice).toBe("update");
		expect(model.strategy).toBeUndefined();
	});

	test("shows child all_versions when the child has siblings and license parents", () => {
		expect(
			resolveVersioningOptionVisibility({
				options: ["existing", "new_version", "all_versions"],
				isLatest: true,
				hasSiblingVersions: true,
			}).showAllOption,
		).toBe(true);
	});

	test("shows all_versions when the parent license overlay changes", () => {
		expect(
			resolveVersioningOptionVisibility({
				options: ["existing", "new_version", "all_versions"],
				isLatest: true,
				hasSiblingVersions: true,
			}).showAllOption,
		).toBe(true);
	});

	test("does not borrow all_versions from a related plan", () => {
		expect(
			resolveVersioningOptionVisibility({
				options: ["existing", "new_version", "all_versions"],
				isLatest: true,
				hasSiblingVersions: false,
			}).showAllOption,
		).toBe(false);
	});

	test("a license-only edit still offers the variant scope step", () => {
		const model = resolvePlanChangePreview({
			preview: planPreview({
				plan_change: {
					item_changes: [],
					license_changes: [
						{ license_plan_id: "seat", action: "updated" },
					],
				},
				variants: [
					{
						plan_id: "pro_eu",
						version: 1,
						state: { has_customers: true, will_archive: false },
						conflicts: [],
					},
				],
			} as Partial<CatalogPlanUpdatePreview>),
			versionChoice: "new",
			variantSelection: null,
			licenseParentSelection: null,
			isLatest: true,
			namesByPlanId: {},
		});

		expect(model.isMetadataOnly).toBe(false);
		expect(model.showVariantScope).toBe(true);
		expect(model.propagate?.variants).toEqual([{ plan_id: "pro_eu" }]);
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
			licenseParentSelection: ["team:2"],
			isLatest: true,
			namesByPlanId: { pro_eu: "Pro EU" },
		});

		expect(model.showLicenseParentScope).toBe(true);
		expect(model.showVariantScope).toBe(true);
		// A base mint sends plan-level variant targets; parents stay pinned.
		expect(model.propagate).toEqual({
			variants: [{ plan_id: "pro_eu" }],
			license_parents: [{ plan_id: "team", version: 2 }],
		});
		expect(model.strategy).toBe("new_version");
	});

	test("combines child all_versions with explicit parent all_versions", () => {
		const preview = planPreview({
			versioning: {
				current_version: 2,
				new_version: null,
				resolved: "existing",
				options: ["existing", "new_version", "all_versions"],
			},
			sibling_versions: [
				{
					plan_id: "seat",
					version: 1,
					state: { has_customers: true, will_archive: false },
				},
			],
			license_parents: [
				{
					plan_id: "team",
					name: "Team",
					version: 1,
					state: { has_customers: true, will_archive: false },
					conflicts: [],
				},
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
			versionChoice: "all",
			variantSelection: null,
			licenseParentSelection: ["team"],
			isLatest: true,
			namesByPlanId: {},
		});

		expect(model.strategy).toBe("all_versions");
		// The whole-plan pick expands into explicit pins, one per linked version.
		expect(model.propagate).toEqual({
			license_parents: [
				{ plan_id: "team", version: 2 },
				{ plan_id: "team", version: 1 },
			],
		});
	});

	test("all_versions makes sibling-linked parent versions independently selectable", () => {
		const preview = planPreview({
			plan_id: "seat",
			version: 2,
			versioning: {
				current_version: 2,
				new_version: null,
				resolved: "all_versions",
				options: ["existing", "all_versions"],
			},
			license_parents: [
				{
					plan_id: "team",
					name: "Team",
					version: 2,
					version_slug: "v2",
					license_action: "propagated",
					state: { has_customers: true, will_archive: false },
					conflicts: [],
				},
			],
			sibling_versions: [
				{
					plan_id: "seat",
					version: 1,
					state: { has_customers: false, will_archive: false },
					license_parents: [
						{
							plan_id: "team",
							name: "Team",
							version: 1,
							version_slug: "v1",
							license_action: "propagated",
							state: { has_customers: true, will_archive: false },
							conflicts: [],
						},
					],
				},
			],
		});

		const model = resolvePlanChangePreview({
			preview,
			versionChoice: "all",
			variantSelection: null,
			licenseParentSelection: null,
			isLatest: true,
			namesByPlanId: {},
		});

		expect(model.licenseParentTargets[0]?.versions.map((v) => v.version)).toEqual(
			[2, 1],
		);
		expect(model.defaultLicenseParentKeys).toEqual(["team"]);
		expect(model.propagate).toEqual({
			license_parents: [
				{ plan_id: "team", version: 2 },
				{ plan_id: "team", version: 1 },
			],
		});

		const pinnedV1 = resolvePlanChangePreview({
			preview,
			versionChoice: "all",
			variantSelection: null,
			licenseParentSelection: ["team:1"],
			isLatest: true,
			namesByPlanId: {},
		});
		expect(pinnedV1.propagate).toEqual({
			license_parents: [{ plan_id: "team", version: 1 }],
		});
	});

	test("existing versioning hides parent versions linked to sibling child rows", () => {
		const preview = planPreview({
			plan_id: "seat",
			version: 2,
			versioning: {
				current_version: 2,
				new_version: null,
				resolved: "existing",
				options: ["existing", "new_version", "all_versions"],
			},
			license_parents: [
				{
					plan_id: "team",
					name: "Team",
					version: 2,
					version_slug: "v2",
					license_action: "propagated",
					state: { has_customers: true, will_archive: false },
					conflicts: [],
				},
			],
			sibling_versions: [
				{
					plan_id: "seat",
					version: 1,
					state: { has_customers: false, will_archive: false },
					license_parents: [
						{
							plan_id: "team",
							name: "Team",
							version: 1,
							version_slug: "v1",
							license_action: "unchanged",
							state: { has_customers: true, will_archive: false },
							conflicts: [],
						},
					],
				},
			],
		});

		const existing = resolvePlanChangePreview({
			preview,
			versionChoice: "update",
			variantSelection: null,
			licenseParentSelection: null,
			isLatest: true,
			namesByPlanId: {},
		});

		expect(
			existing.licenseParentTargets[0]?.versions.map((entry) => entry.version),
		).toEqual([2]);
		expect(existing.propagate).toEqual({
			license_parents: [{ plan_id: "team", version: 2 }],
		});

		const allVersions = resolvePlanChangePreview({
			preview,
			versionChoice: "all",
			variantSelection: null,
			licenseParentSelection: null,
			isLatest: true,
			namesByPlanId: {},
		});
		expect(
			allVersions.licenseParentTargets[0]?.versions.map((entry) => entry.version),
		).toEqual([2, 1]);
	});

	test("all_versions includes historical variant conflicts in default selection", () => {
		const preview = planPreview({
			versioning: {
				current_version: 2,
				new_version: null,
				resolved: "existing",
				options: ["existing", "all_versions"],
			},
			sibling_versions: [
				{
					plan_id: "pro",
					version: 1,
					state: { has_customers: false, will_archive: false },
				},
			],
			variants: [
				{
					plan_id: "pro_eu",
					version: 2,
					state: { has_customers: false, will_archive: false },
					conflicts: [],
					sibling_versions: [
						{
							plan_id: "pro_eu",
							version: 1,
							state: { has_customers: true, will_archive: false },
							variant_action: "unchanged",
							conflicts: [
								{
									reason: "value_divergence",
									feature_name: "Messages",
								},
							],
						},
					],
				},
			],
		});
		const allVersions = resolvePlanChangePreview({
			preview,
			versionChoice: "all",
			variantSelection: null,
			licenseParentSelection: null,
			isLatest: true,
			namesByPlanId: { pro_eu: "Pro EU" },
		});
		const existing = resolvePlanChangePreview({
			preview,
			versionChoice: "update",
			variantSelection: null,
			licenseParentSelection: null,
			isLatest: true,
			namesByPlanId: { pro_eu: "Pro EU" },
		});

		expect(
			allVersions.variantTargets[0].versions.map((entry) => entry.version),
		).toEqual([2, 1]);
		expect(
			allVersions.variantTargets[0].versions.flatMap((entry) => entry.conflicts),
		).toHaveLength(1);
		expect(allVersions.defaultVariantKeys).toEqual(["pro_eu:2"]);
		// Same-base siblings stay pinnable on existing — only sibling-base
		// rows are added when the choice is all_versions.
		expect(
			existing.variantTargets[0].versions.map((entry) => entry.version),
		).toEqual([2, 1]);
		expect(existing.defaultVariantKeys).toEqual(["pro_eu:2"]);
	});

	test("all_versions offers sibling-anchored variants and pins every row", () => {
		const preview = planPreview({
			version: 2,
			versioning: {
				current_version: 2,
				new_version: null,
				resolved: "existing",
				options: ["existing", "all_versions"],
			},
			variants: [
				{
					plan_id: "pro_eu",
					version: 2,
					state: { has_customers: false, will_archive: false },
					conflicts: [],
				},
			],
			sibling_versions: [
				{
					plan_id: "pro",
					version: 1,
					state: { has_customers: false, will_archive: false },
					variants: [
						{
							plan_id: "pro_eu",
							version: 1,
							state: { has_customers: false, will_archive: false },
							conflicts: [],
						},
					],
				},
			],
		});

		const existing = resolvePlanChangePreview({
			preview,
			versionChoice: "update",
			variantSelection: null,
			licenseParentSelection: null,
			isLatest: true,
			namesByPlanId: { pro_eu: "Pro EU" },
		});
		expect(existing.propagate).toEqual({
			variants: [{ plan_id: "pro_eu", version: 2 }],
		});

		const allVersions = resolvePlanChangePreview({
			preview,
			versionChoice: "all",
			variantSelection: null,
			licenseParentSelection: null,
			isLatest: true,
			namesByPlanId: { pro_eu: "Pro EU" },
		});
		expect(allVersions.variantTargets.map((target) => target.planId)).toEqual([
			"pro_eu",
		]);
		expect(
			allVersions.variantTargets[0].versions.map((entry) => entry.version),
		).toEqual([2, 1]);
		expect(allVersions.propagate).toEqual({
			variants: [
				{ plan_id: "pro_eu", version: 2 },
				{ plan_id: "pro_eu", version: 1 },
			],
		});
	});

	test("all_versions offers every sibling-anchored version of the same variant", () => {
		const preview = planPreview({
			plan_id: "qa-sba-team",
			version: 2,
			versioning: {
				current_version: 2,
				new_version: null,
				resolved: "existing",
				options: ["existing", "all_versions"],
			},
			variants: [
				{
					plan_id: "qa-sba-eu",
					version: 3,
					state: { has_customers: false, will_archive: false },
					conflicts: [],
				},
			],
			sibling_versions: [
				{
					plan_id: "qa-sba-team",
					version: 1,
					state: { has_customers: false, will_archive: false },
					variants: [
						{
							plan_id: "qa-sba-eu",
							version: 2,
							state: { has_customers: false, will_archive: false },
							conflicts: [],
							sibling_versions: [
								{
									plan_id: "qa-sba-eu",
									version: 1,
									state: { has_customers: false, will_archive: false },
									variant_action: "unchanged",
									conflicts: [],
								},
							],
						},
					],
				},
			],
		});

		const existing = resolvePlanChangePreview({
			preview,
			versionChoice: "update",
			variantSelection: null,
			licenseParentSelection: null,
			isLatest: true,
			namesByPlanId: { "qa-sba-eu": "Team EU" },
		});
		expect(existing.variantTargets[0].versions.map((entry) => entry.version)).toEqual(
			[3],
		);

		const allVersions = resolvePlanChangePreview({
			preview,
			versionChoice: "all",
			variantSelection: null,
			licenseParentSelection: null,
			isLatest: true,
			namesByPlanId: { "qa-sba-eu": "Team EU" },
		});
		expect(
			allVersions.variantTargets[0].versions.map((entry) => entry.version),
		).toEqual([3, 2, 1]);
		expect(allVersions.propagate).toEqual({
			variants: [
				{ plan_id: "qa-sba-eu", version: 3 },
				{ plan_id: "qa-sba-eu", version: 2 },
				{ plan_id: "qa-sba-eu", version: 1 },
			],
		});
	});

	test("defaults a conflict-free parent to all versions, pinning around conflicts", () => {
		// v2 is the lane entry; v1 nests under it as a linked sibling version.
		const teamParent = ({
			v1Conflicts = [],
		}: {
			v1Conflicts?: CatalogLicenseParentPreview["conflicts"];
		}): CatalogLicenseParentPreview =>
			({
				plan_id: "team",
				name: "Team",
				version: 2,
				state: { has_customers: true, will_archive: false },
				conflicts: [],
				sibling_versions: [
					{
						plan_id: "team",
						version: 1,
						state: { has_customers: true, will_archive: false },
						conflicts: v1Conflicts,
					},
				],
			}) as CatalogLicenseParentPreview;

		const clean = resolvePlanChangePreview({
			preview: planPreview({
				license_parents: [teamParent({})],
			}),
			versionChoice: "update",
			variantSelection: null,
			licenseParentSelection: null,
			isLatest: true,
			namesByPlanId: {},
		});
		expect(clean.defaultLicenseParentKeys).toEqual(["team"]);
		expect(clean.propagate).toEqual({
			license_parents: [
				{ plan_id: "team", version: 2 },
				{ plan_id: "team", version: 1 },
			],
		});

		const withConflict = resolvePlanChangePreview({
			preview: planPreview({
				license_parents: [
					teamParent({ v1Conflicts: [{ reason: "value_divergence" }] }),
				],
			}),
			versionChoice: "update",
			variantSelection: null,
			licenseParentSelection: null,
			isLatest: true,
			namesByPlanId: {},
		});
		expect(withConflict.defaultLicenseParentKeys).toEqual(["team:2"]);
		expect(withConflict.propagate).toEqual({
			license_parents: [{ plan_id: "team", version: 2 }],
		});
	});

	test("existing on a historical row still offers its linked variant versions", () => {
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
		expect(model.showVariantScope).toBe(true);
		expect(model.propagate).toEqual({
			variants: [{ plan_id: "pro_eu", version: 1 }],
		});
	});

	test("a pinned variant version is the only propagate target", () => {
		const preview = planPreview({
			version: 2,
			versioning: {
				current_version: 2,
				new_version: null,
				resolved: "existing",
				options: ["existing", "all_versions"],
			},
			variants: [
				{
					plan_id: "pro_eu",
					version: 2,
					state: { has_customers: false, will_archive: false },
					conflicts: [],
				},
			],
			sibling_versions: [
				{
					plan_id: "pro",
					version: 1,
					state: { has_customers: false, will_archive: false },
					variants: [
						{
							plan_id: "pro_eu",
							version: 1,
							state: { has_customers: false, will_archive: false },
							conflicts: [],
						},
					],
				},
			],
		});

		const pinned = resolvePlanChangePreview({
			preview,
			versionChoice: "all",
			variantSelection: ["pro_eu:1"],
			licenseParentSelection: null,
			isLatest: true,
			namesByPlanId: { pro_eu: "Pro EU" },
		});
		expect(pinned.propagate).toEqual({
			variants: [{ plan_id: "pro_eu", version: 1 }],
		});
	});
});
