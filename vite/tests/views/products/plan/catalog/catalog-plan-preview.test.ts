import { describe, expect, test } from "bun:test";
import type {
	CatalogPlanUpdatePreview,
	PreviewUpdateCatalogResponse,
} from "@autumn/shared";
import {
	applyPropagationTargetDiffs,
	buildCatalogMigrateTargets,
	buildCatalogPropagate,
	buildSelectedLicenseParentPropagate,
	catalogPreviewAliasReplacements,
	catalogPreviewHasPlanIdChange,
	catalogPreviewHasPromotion,
	catalogPreviewHasVersionSlugChange,
	catalogPreviewOpensDialog,
	catalogPreviewPlanIdChange,
	catalogPreviewVersionSlugChange,
	emptyCatalogPlanChangeDiff,
	hasCatalogMigrationTargets,
	isCatalogMetadataOnly,
	isConfirmOnlyPlanChangeDialog,
	planChangeToTargetDiff,
	previewOpensStrategyStep,
	strategyForCatalogPreview,
	toLicenseParentTargets,
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

	test("catalogPreviewOpensDialog follows options, variants, license parents, alias replacement, and plan id change", () => {
		expect(catalogPreviewOpensDialog({ preview: undefined })).toBe(false);
		expect(catalogPreviewOpensDialog({ preview: planPreview() })).toBe(false);
		expect(
			catalogPreviewOpensDialog({
				preview: planPreview({
					alias_replacement: { alias_id: "pro", plan_id: "pro_new" },
				}),
			}),
		).toBe(true);
		expect(
			catalogPreviewOpensDialog({
				preview: planPreview({
					plan_change: {
						item_changes: [],
						previous_attributes: { id: "pro" },
					},
				}),
			}),
		).toBe(true);
		expect(
			catalogPreviewOpensDialog({
				preview: planPreview({
					plan_change: {
						item_changes: [],
						previous_attributes: { name: "Pro" },
					},
				}),
			}),
		).toBe(false);
		expect(
			catalogPreviewHasPlanIdChange({
				preview: planPreview({
					plan_change: {
						item_changes: [],
						previous_attributes: { id: "pro" },
					},
				}),
			}),
		).toBe(true);
		expect(
			catalogPreviewPlanIdChange({
				preview: planPreview({
					plan_change: {
						item_changes: [],
						previous_attributes: { id: "pro" },
					},
				}),
				nextPlanId: "pro_plus",
			}),
		).toEqual({ from: "pro", to: "pro_plus" });
		expect(
			isConfirmOnlyPlanChangeDialog({
				preview: planPreview({
					plan_change: {
						item_changes: [],
						previous_attributes: { id: "pro" },
					},
				}),
				showVersionStrategy: false,
				showVariantScope: false,
				showLicenseParentScope: false,
			}),
		).toBe(true);
		expect(
			isConfirmOnlyPlanChangeDialog({
				preview: planPreview({
					plan_change: {
						item_changes: [],
						customize: { items: [] },
						previous_attributes: { id: "pro" },
					},
				}),
				showVersionStrategy: true,
				showVariantScope: false,
				showLicenseParentScope: false,
			}),
		).toBe(false);
		expect(
			catalogPreviewAliasReplacements({
				preview: planPreview({
					variants: [
						{
							plan_id: "pro_eu",
							version: 1,
							state: { has_customers: false, will_archive: false },
							alias_replacement: { alias_id: "pro", plan_id: "pro_new" },
						},
					],
				}),
			}),
		).toEqual([{ alias_id: "pro", plan_id: "pro_new" }]);
		const versioningOnly = planPreview({
			versioning: {
				current_version: 1,
				new_version: null,
				resolved: "existing",
				options: ["existing"],
			},
		});
		expect(previewOpensStrategyStep({ preview: versioningOnly })).toBe(true);
		expect(isCatalogMetadataOnly({ preview: versioningOnly })).toBe(true);
		expect(catalogPreviewOpensDialog({ preview: versioningOnly })).toBe(false);
		expect(
			catalogPreviewOpensDialog({
				preview: planPreview({
					plan_change: { item_changes: [], customize: { items: [] } },
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
					plan_change: { item_changes: [], customize: { items: [] } },
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
					plan_change: {
						item_changes: [],
						license_changes: [
							{
								license_plan_id: "seat",
								action: "updated",
								previous_attributes: null,
							},
						],
					},
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

	test("a version slug rename opens a confirm-only Review on its own", () => {
		const renamed = planPreview({
			version_slug: "v1",
			new_version_slug: "beta",
		});
		expect(catalogPreviewVersionSlugChange({ preview: renamed })).toEqual({
			from: "v1",
			to: "beta",
		});
		expect(catalogPreviewHasVersionSlugChange({ preview: renamed })).toBe(true);
		expect(catalogPreviewOpensDialog({ preview: renamed })).toBe(true);
		expect(
			isConfirmOnlyPlanChangeDialog({
				preview: renamed,
				showVersionStrategy: false,
				showVariantScope: false,
				showLicenseParentScope: false,
			}),
		).toBe(true);

		const unchanged = planPreview({ version_slug: "v1" });
		expect(
			catalogPreviewVersionSlugChange({ preview: unchanged }),
		).toBeUndefined();
		expect(catalogPreviewOpensDialog({ preview: unchanged })).toBe(false);
	});

	test("promotion_details presence opens a confirm-only Review", () => {
		const promotePreview = planPreview({
			promotion_details: { previous_active_version_slug: "v1" },
		});
		expect(catalogPreviewHasPromotion({ preview: planPreview() })).toBe(false);
		expect(catalogPreviewHasPromotion({ preview: promotePreview })).toBe(true);
		expect(catalogPreviewOpensDialog({ preview: promotePreview })).toBe(true);
		expect(
			isConfirmOnlyPlanChangeDialog({
				preview: promotePreview,
				showVersionStrategy: false,
				showVariantScope: false,
				showLicenseParentScope: false,
			}),
		).toBe(true);
		expect(
			isConfirmOnlyPlanChangeDialog({
				preview: promotePreview,
				showVersionStrategy: true,
				showVariantScope: false,
				showLicenseParentScope: false,
			}),
		).toBe(false);
		expect(
			catalogPreviewOpensDialog({
				preview: planPreview({
					promotion_details: { previous_active_version_slug: "v1" },
					plan_change: {
						item_changes: [],
						previous_attributes: { name: "Pro" },
					},
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

	test("a variant with customers mints on the discover preview, which reports resolved: existing", () => {
		const [withCustomers, withoutCustomers] = toVariantPropagationTargets({
			variants: [
				{
					plan_id: "pro_eu",
					version: 1,
					version_slug: "v1",
					state: { has_customers: true, will_archive: false },
					// The discover preview sends no propagate, so no mint is resolved yet.
					versioning: {
						current_version: 1,
						new_version: null,
						resolved: "existing",
						options: [],
					},
					sibling_versions: [
						{
							plan_id: "pro_eu",
							version: 2,
							version_slug: "add-dashboard",
							state: { has_customers: false, will_archive: false },
						},
					],
				},
				{
					plan_id: "pro_uk",
					version: 1,
					version_slug: "v1",
					state: { has_customers: false, will_archive: false },
					versioning: {
						current_version: 1,
						new_version: null,
						resolved: "existing",
						options: [],
					},
				},
			],
			namesByPlanId: {},
			baseMintsNewVersion: true,
		} as Parameters<typeof toVariantPropagationTargets>[0]);

		// Active v1 with customers, max v2 → the mint lands at v3, not active+1.
		expect(withCustomers.mintsNewVersion).toBe(true);
		expect(withCustomers.mintVersion).toBe(3);
		expect(withCustomers.takenSlugs).toEqual(["add-dashboard", "v1"]);
		// No customers means the base edit lands in place, so there is nothing to name.
		expect(withoutCustomers.mintsNewVersion).toBe(false);
	});

	test("maps variants and license parents onto propagate targets", () => {
		expect(
			toVariantPropagationTargets({
				variants: [
					{
						plan_id: "pro_eu",
						version: 1,
						version_slug: "v1",
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
				mintsNewVersion: false,
				mintVersion: 2,
				takenSlugs: ["v1"],
				...emptyCatalogPlanChangeDiff(),
			},
		]);
		expect(
			toVariantPropagationTargets({
				variants: [
					{
						plan_id: "pro_eu",
						version: 2,
						state: { has_customers: false, will_archive: false },
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
				namesByPlanId: { pro_eu: "Pro EU" },
				includeHistoricalVersions: true,
			})[0].conflicts,
		).toEqual([
			{
				reason: "value_divergence",
				feature_name: "Messages",
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
				sibling_versions: [
					{
						plan_id: "team",
						version: 1,
						state: { has_customers: true, will_archive: false },
						conflicts: [],
						plan_change: { item_changes: [] },
					},
				],
			},
		];
		// One target per parent plan, its linked versions newest first.
		expect(toLicenseParentTargets({ parents })).toEqual([
			{
				planId: "team",
				name: "Team",
				versions: [
					{
						version: 2,
						key: "team:2",
						conflicts: [],
						...emptyCatalogPlanChangeDiff(),
					},
					{
						version: 1,
						key: "team:1",
						conflicts: [],
						...emptyCatalogPlanChangeDiff(),
					},
				],
			},
		]);
		expect(
			buildSelectedLicenseParentPropagate({
				selectedKeys: ["team:1", "team:2"],
			}),
		).toEqual([
			{ plan_id: "team", version: 1 },
			{ plan_id: "team", version: 2 },
		]);
		expect(
			buildSelectedLicenseParentPropagate({ selectedKeys: ["team"] }),
		).toEqual([{ plan_id: "team", versioning: "all_versions" }]);
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

	test("carries license_changes onto variant, parent, and review rows", () => {
		const licenseChange = {
			license_plan_id: "qa-eus-seat",
			action: "updated",
			previous_attributes: null,
			plan_change: {
				item_changes: [{ feature_id: "dashboard", action: "created" }],
			},
		};
		const planChange = {
			item_changes: [],
			license_changes: [licenseChange],
		};

		const [variantTarget] = toVariantPropagationTargets({
			variants: [
				{
					plan_id: "qa-eus-eu",
					version: 1,
					state: { has_customers: false, will_archive: false },
					plan_change: planChange,
				},
			],
			namesByPlanId: { "qa-eus-eu": "QA Compose EU" },
		});
		expect(variantTarget.itemChanges).toEqual([]);
		expect(variantTarget.licenseChanges).toHaveLength(1);
		expect(variantTarget.licenseChanges[0]?.license_plan_id).toBe(
			"qa-eus-seat",
		);

		const [parentTarget] = toLicenseParentTargets({
			parents: [
				{
					plan_id: "qa-eus",
					name: "QA Compose",
					version: 1,
					state: { has_customers: true, will_archive: false },
					plan_change: planChange,
				},
			],
		});
		expect(parentTarget.versions[0].licenseChanges[0]?.license_plan_id).toBe(
			"qa-eus-seat",
		);

		const [base, variant, parent] = buildCatalogMigrateTargets({
			preview: planPreview({
				plan_id: "qa-eus",
				plan_change: planChange,
				variants: [
					{
						plan_id: "qa-eus-eu",
						version: 1,
						state: { has_customers: false, will_archive: false },
						plan_change: planChange,
					},
				],
				license_parents: [
					{
						plan_id: "team",
						name: "Team",
						version: 2,
						state: { has_customers: true, will_archive: false },
						plan_change: planChange,
					},
				],
			}),
			selectedVariantIds: ["qa-eus-eu"],
			selectedLicenseParentKeys: ["team:2"],
			versionChoice: "update",
			currentVersion: 1,
			baseName: "QA Compose",
		});

		expect(base.role).toBe("base");
		expect(base.rows[0].licenseChanges[0]?.license_plan_id).toBe("qa-eus-seat");
		expect(variant.role).toBe("variant");
		expect(variant.rows[0].licenseChanges[0]?.license_plan_id).toBe(
			"qa-eus-seat",
		);
		expect(parent.role).toBe("license_parent");
		expect(parent.rows[0].licenseChanges[0]?.license_plan_id).toBe(
			"qa-eus-seat",
		);
	});

	test("fills empty variant diffs from the current plan, then prefers scoped", () => {
		const [emptyTarget] = toVariantPropagationTargets({
			variants: [
				{
					plan_id: "qa-eus-eu",
					version: 1,
					state: { has_customers: false, will_archive: false },
					conflicts: [
						{
							reason: "value_divergence",
							feature_name: "Messages",
							license_plan_id: "qa-eus-seat",
						},
					],
				},
			],
			namesByPlanId: { "qa-eus-eu": "QA Compose EU" },
		});
		const fallbackDiff = planChangeToTargetDiff({
			planChange: {
				item_changes: [],
				license_changes: [
					{
						license_plan_id: "qa-eus-seat",
						action: "updated",
						previous_attributes: null,
						plan_change: {
							item_changes: [{ feature_id: "messages", action: "updated" }],
						},
					},
				],
			},
		});

		const [fromFallback] = applyPropagationTargetDiffs({
			targets: [emptyTarget],
			fallbackDiff,
		});
		expect(fromFallback.conflicts[0]?.license_plan_id).toBe("qa-eus-seat");
		expect(fromFallback.licenseChanges[0]?.license_plan_id).toBe("qa-eus-seat");

		const [fromScoped] = applyPropagationTargetDiffs({
			targets: [emptyTarget],
			fallbackDiff,
			scopedById: new Map([
				[
					"qa-eus-eu",
					{
						item_changes: [],
						license_changes: [
							{
								license_plan_id: "qa-eus-seat",
								action: "updated",
								previous_attributes: null,
								plan_change: {
									item_changes: [{ feature_id: "messages", action: "updated" }],
								},
							},
						],
					},
				],
			]),
		});
		expect(fromScoped.licenseChanges[0]?.plan_change?.item_changes).toEqual([
			{ feature_id: "messages", action: "updated" },
		]);
	});

	test("review lists only variant versions whose preview action changes them", () => {
		const itemChange = {
			item_changes: [{ feature_id: "workflows", action: "created" as const }],
		};
		const [variant] = buildCatalogMigrateTargets({
			preview: planPreview({
				plan_id: "qa-euv-team",
				version: 2,
				state: { has_customers: false, will_archive: false },
				plan_change: itemChange,
				variants: [
					{
						plan_id: "qa-euv-eu",
						version: 2,
						state: { has_customers: false, will_archive: false },
						variant_action: "propagated",
						plan_change: itemChange,
						sibling_versions: [
							{
								plan_id: "qa-euv-eu",
								version: 1,
								state: { has_customers: true, will_archive: false },
								variant_action: "propagated",
								plan_change: itemChange,
							},
							{
								plan_id: "qa-euv-eu",
								version: 0,
								state: { has_customers: true, will_archive: false },
								variant_action: "unchanged",
							},
						],
					},
				],
			}),
			selectedVariantIds: ["qa-euv-eu"],
			selectedLicenseParentKeys: [],
			versionChoice: "all",
			currentVersion: 2,
			baseName: "QA Versioned Variant Team",
		}).filter((target) => target.role === "variant");

		expect(variant.rows.map((row) => row.version)).toEqual([2, 1]);
	});

	test("review uses a variant's resolved versioning instead of the base choice", () => {
		const [variant] = buildCatalogMigrateTargets({
			preview: planPreview({
				plan_id: "team",
				version: 2,
				state: { has_customers: true, will_archive: false },
				variants: [
					{
						plan_id: "team-eu",
						version: 2,
						state: { has_customers: true, will_archive: false },
						variant_action: "propagated",
						versioning: {
							current_version: 2,
							new_version: null,
							resolved: "existing",
							options: ["existing", "new_version", "all_versions"],
						},
					},
				],
			}),
			selectedVariantIds: ["team-eu"],
			selectedLicenseParentKeys: [],
			versionChoice: "new",
			currentVersion: 2,
			baseName: "Team",
		}).filter((target) => target.role === "variant");

		expect(variant.rows[0]).toMatchObject({
			version: 2,
			isCurrent: true,
			isNew: false,
		});
	});

	test("groups every selected parent version into one card, newest first", () => {
		const planChange = {
			item_changes: [{ feature_id: "dashboard", action: "created" as const }],
		};
		const preview = planPreview({
			plan_id: "seat",
			plan_change: planChange,
			license_parents: [
				{
					plan_id: "team",
					name: "Team",
					version: 2,
					state: { has_customers: true, will_archive: false },
					plan_change: planChange,
					sibling_versions: [
						{
							plan_id: "team",
							version: 1,
							state: { has_customers: true, will_archive: false },
							plan_change: planChange,
						},
					],
				},
			],
		});

		const parentCardsFor = ({
			selectedLicenseParentKeys,
			versionChoice = "update" as const,
		}: {
			selectedLicenseParentKeys: string[];
			versionChoice?: "new" | "update" | "all";
		}) =>
			buildCatalogMigrateTargets({
				preview,
				selectedVariantIds: [],
				selectedLicenseParentKeys,
				versionChoice,
				currentVersion: 1,
				baseName: "Seat",
			}).filter((target) => target.role === "license_parent");

		const wholePlan = parentCardsFor({ selectedLicenseParentKeys: ["team"] });
		expect(wholePlan).toHaveLength(1);
		expect(wholePlan[0].id).toBe("license-parent:team");
		expect(wholePlan[0].rows.map((row) => row.version)).toEqual([2, 1]);
		// Only the plan's latest version is "Current", matching the base card.
		expect(wholePlan[0].rows.map((row) => row.isCurrent)).toEqual([
			true,
			false,
		]);

		const pinned = parentCardsFor({ selectedLicenseParentKeys: ["team:1"] });
		expect(pinned).toHaveLength(1);
		expect(pinned[0].rows.map((row) => row.version)).toEqual([1]);
		expect(pinned[0].rows[0].isCurrent).toBe(false);

		expect(parentCardsFor({ selectedLicenseParentKeys: [] })).toEqual([]);
	});

	test("a parent mint collapses the card to the single new version", () => {
		const [parent] = buildCatalogMigrateTargets({
			preview: planPreview({
				plan_id: "seat",
				license_parents: [
					{
						plan_id: "team",
						name: "Team",
						version: 3,
						state: { has_customers: true, will_archive: false },
						plan_change: { item_changes: [] },
						versioning: {
							current_version: 2,
							new_version: 3,
							resolved: "new_version",
							options: ["existing", "new_version", "all_versions"],
						},
						sibling_versions: [
							{
								plan_id: "team",
								version: 2,
								state: { has_customers: true, will_archive: false },
								license_action: "unchanged",
								plan_change: { item_changes: [] },
							},
							{
								plan_id: "team",
								version: 1,
								state: { has_customers: true, will_archive: false },
								plan_change: { item_changes: [] },
							},
						],
					},
				],
			}),
			selectedVariantIds: [],
			selectedLicenseParentKeys: ["team"],
			versionChoice: "new",
			currentVersion: 1,
			baseName: "Seat",
		}).filter((target) => target.role === "license_parent");

		expect(parent.rows).toHaveLength(1);
		expect(parent.rows[0]).toMatchObject({ version: 3, isNew: true });
	});

	test("a parent new_version fallback lists only the existing version that changes", () => {
		const [parent] = buildCatalogMigrateTargets({
			preview: planPreview({
				plan_id: "seat",
				license_parents: [
					{
						plan_id: "team",
						name: "Team",
						version: 2,
						state: { has_customers: false, will_archive: false },
						license_action: "propagated",
						plan_change: { item_changes: [] },
						versioning: {
							current_version: 2,
							new_version: null,
							resolved: "existing",
							options: ["existing", "all_versions"],
						},
						sibling_versions: [
							{
								plan_id: "team",
								version: 1,
								state: { has_customers: false, will_archive: false },
								license_action: "unchanged",
								plan_change: { item_changes: [] },
							},
						],
					},
				],
			}),
			selectedVariantIds: [],
			selectedLicenseParentKeys: ["team"],
			versionChoice: "new",
			currentVersion: 1,
			baseName: "Seat",
		}).filter((target) => target.role === "license_parent");

		expect(parent.rows.map((row) => row.version)).toEqual([2]);
		expect(parent.rows[0].isNew).toBe(false);
	});
});
