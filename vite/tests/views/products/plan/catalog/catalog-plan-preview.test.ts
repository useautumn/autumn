import { describe, expect, test } from "bun:test";
import type {
	CatalogPlanUpdatePreview,
	PreviewUpdateCatalogResponse,
} from "@autumn/shared";
import {
	buildCatalogPropagate,
	buildSelectedLicenseParentPropagate,
	catalogPreviewOpensDialog,
	hasCatalogMigrationTargets,
	isCatalogMetadataOnly,
	previewOpensStrategyStep,
	strategyForCatalogPreview,
	toLicenseParentPropagationTargets,
	toVariantPropagationTargets,
	versionChoiceToStrategy,
} from "@/views/products/plan/catalog/catalogPlanPreview";

const planPreview = (
	overrides: Partial<CatalogPlanUpdatePreview> = {},
): CatalogPlanUpdatePreview =>
	({
		plan_id: "pro",
		version: 1,
		action: "update",
		state: { has_customers: false, will_archive: false },
		plan_change: null,
		versioning: null,
		...overrides,
	}) as CatalogPlanUpdatePreview;

describe("catalog plan preview helpers", () => {
	test("versionChoiceToStrategy maps dialog picks", () => {
		expect(versionChoiceToStrategy({ choice: "new" })).toBe("new_version");
		expect(versionChoiceToStrategy({ choice: "all" })).toBe("all_versions");
		expect(versionChoiceToStrategy({ choice: "update" })).toBeUndefined();
	});

	test("strategyForCatalogPreview withholds new_version until options or latest allow it", () => {
		expect(
			strategyForCatalogPreview({
				choice: "new",
				options: undefined,
				isLatest: true,
			}),
		).toBe("new_version");
		expect(
			strategyForCatalogPreview({
				choice: "new",
				options: undefined,
				isLatest: false,
			}),
		).toBeUndefined();
		expect(
			strategyForCatalogPreview({
				choice: "new",
				options: ["existing"],
				isLatest: true,
			}),
		).toBeUndefined();
		expect(
			strategyForCatalogPreview({
				choice: "all",
				options: ["existing", "all_versions"],
				isLatest: true,
			}),
		).toBe("all_versions");
		expect(
			strategyForCatalogPreview({
				choice: "all",
				options: ["existing"],
				isLatest: true,
			}),
		).toBeUndefined();
		expect(
			strategyForCatalogPreview({
				choice: "update",
				options: ["existing", "new_version"],
				isLatest: true,
			}),
		).toBeUndefined();
	});

	test("catalogPreviewOpensDialog follows options, variants, and license parents", () => {
		expect(catalogPreviewOpensDialog({ preview: undefined })).toBe(false);
		expect(catalogPreviewOpensDialog({ preview: planPreview() })).toBe(false);
		expect(
			previewOpensStrategyStep({
				preview: planPreview({
					versioning: {
						current_version: 1,
						new_version: null,
						resolved: "existing",
						options: ["existing"],
					},
				}),
			}),
		).toBe(true);
		expect(
			catalogPreviewOpensDialog({
				preview: planPreview({
					variants: [
						{
							plan_id: "pro_eu",
							version: 1,
							state: { has_customers: false, will_archive: false },
						},
					],
				}),
			}),
		).toBe(true);
		expect(
			catalogPreviewOpensDialog({
				preview: planPreview({
					license_parents: [
						{
							plan_id: "team",
							name: "Team",
							version: 2,
							state: { has_customers: true, will_archive: false },
						},
					],
				}),
			}),
		).toBe(true);
	});

	test("isCatalogMetadataOnly is true when customize and licenses are absent", () => {
		expect(isCatalogMetadataOnly({ preview: planPreview() })).toBe(true);
		expect(
			isCatalogMetadataOnly({
				preview: planPreview({
					plan_change: { item_changes: [], customize: { items: [] } },
				}),
			}),
		).toBe(false);
		expect(
			isCatalogMetadataOnly({
				preview: planPreview({
					plan_change: {
						item_changes: [],
						license_changes: [
							{
								license_plan_id: "seat",
								action: "created",
								previous_attributes: null,
							},
						],
					},
				}),
			}),
		).toBe(false);
	});

	test("hasCatalogMigrationTargets reads catalog-level migrations", () => {
		expect(hasCatalogMigrationTargets({ preview: undefined })).toBe(false);
		expect(
			hasCatalogMigrationTargets({
				preview: { plans: [], features: [], migrations: [] },
			}),
		).toBe(false);
		expect(
			hasCatalogMigrationTargets({
				preview: {
					plans: [],
					features: [],
					migrations: [
						{
							plans: [{ plan_id: "pro", versions: [1] }],
							include_custom: false,
							filter: { customer_id: undefined },
							operations: [],
							no_billing_changes: true,
						},
					],
				} as PreviewUpdateCatalogResponse,
			}),
		).toBe(true);
	});

	test("maps variants and license parents onto propagate targets", () => {
		expect(
			toVariantPropagationTargets({
				variants: [
					{
						plan_id: "pro_eu",
						version: 1,
						state: { has_customers: false, will_archive: false },
						conflicts: [],
						plan_change: { item_changes: [] },
					},
				],
				namesByPlanId: { pro_eu: "Pro EU" },
			}),
		).toEqual([
			{
				id: "pro_eu",
				name: "Pro EU",
				detail: "pro_eu",
				conflicts: [],
				itemChanges: [],
			},
		]);

		const parents = [
			{
				plan_id: "team",
				name: "Team",
				version: 2,
				state: { has_customers: true, will_archive: false },
				conflicts: [],
				plan_change: { item_changes: [] },
			},
		];
		expect(toLicenseParentPropagationTargets({ parents })).toEqual([
			{
				id: "team@2",
				name: "Team",
				detail: "team · v2",
				conflicts: [],
				itemChanges: [],
			},
		]);
		expect(
			buildSelectedLicenseParentPropagate({
				parents,
				selectedIds: ["team@2"],
			}),
		).toEqual([{ plan_id: "team", version: 2 }]);
		expect(
			buildCatalogPropagate({
				variantIds: ["pro_eu"],
				licenseParents: [{ plan_id: "team", version: 2 }],
			}),
		).toEqual({
			variants: [{ plan_id: "pro_eu" }],
			license_parents: [{ plan_id: "team", version: 2 }],
		});
		expect(
			buildCatalogPropagate({ variantIds: [], licenseParents: [] }),
		).toBeUndefined();
	});
});
