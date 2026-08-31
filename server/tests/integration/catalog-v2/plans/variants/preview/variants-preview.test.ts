/**
 * catalogV2.preview_update — variants[] nest on the base row.
 *
 * Contract:
 *   always list every latest variant
 *   variant_action: explicit | propagated | unchanged
 *   follow-only overlapping slot → conflicts; explicit swallows them
 *   sibling_versions lists every existing candidate with its own variant_action
 *   existing → latest propagated, historical unchanged
 *   all_versions → latest and historical propagated
 *   explicit target version → only that version propagated
 *   new_version → mint propagated, every existing version unchanged
 *   unchanged candidates still report conflicts for scope decisions
 *   preview writes nothing
 *
 * Red (current):  existing/new_version omit unchanged candidate versions.
 * Green (after):  every candidate version is present and explicitly classified.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	dashboardItem,
	messagesItem,
} from "../../licenses/utils/seedLicensePlans.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import { cleanupPlanCustomerRefs } from "../../utils/cleanupPlanCustomerRefs.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";
import { expectVariantPlanCorrect } from "../utils/expectVariantPointer.js";
import {
	seedBaseWithVariant,
	seedDivergedVariantBase,
	seedVariantNewVersion,
} from "../utils/seedVariantPlans.js";

const messagesValueDivergence = {
	reason: "value_divergence" as const,
	feature_name: "Messages",
	item_filter: { feature_id: TestFeature.Messages },
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants preview: two variants, only listed is propagated")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_prv_two");
		const listedId = uniqueTestId("cv2_var_prv_two_a");
		const pinnedId = uniqueTestId("cv2_var_prv_two_b");
		await deleteDbPlans({ ctx, planIds: [baseId, listedId, pinnedId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId: listedId,
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [{ variant_plan_id: pinnedId, name: "Team UK" }],
					},
				],
			});
			const params = {
				plans: [
					{
						plan_id: baseId,
						items: [messagesItem(100), dashboardItem()],
						propagate: { variants: [{ plan_id: listedId, version: 1 }] },
					},
				],
			};
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate(params),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: baseId,
					variants: [
						{
							planId: listedId,
							variantAction: "propagated",
							hasPlanChange: true,
						},
						{
							planId: pinnedId,
							variantAction: "unchanged",
							hasPlanChange: false,
						},
					],
				},
			});
			await autumnV2_3.catalogV2.update(params);
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: listedId,
				featureIds: [TestFeature.Messages, TestFeature.Dashboard],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: pinnedId,
				featureIds: [TestFeature.Messages],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, listedId, pinnedId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants preview: propagated overlapping slot lists value_divergence")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_prv_div");
		const variantId = uniqueTestId("cv2_var_prv_div_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(150)],
							propagate: { variants: [{ plan_id: variantId, version: 1 }] },
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: baseId,
					variants: [
						{
							planId: variantId,
							variantAction: "propagated",
							conflicts: [messagesValueDivergence],
						},
					],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants preview: declared customize is explicit and omits conflicts")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_prv_ex");
		const variantId = uniqueTestId("cv2_var_prv_ex_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(150), dashboardItem()],
							variants: [
								{
									variant_plan_id: variantId,
									customize: {
										remove_items: [{ feature_id: TestFeature.Messages }],
										add_items: [messagesItem(300)],
									},
								},
							],
							propagate: { variants: [{ plan_id: variantId, version: 1 }] },
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: baseId,
					variants: [
						{
							planId: variantId,
							variantAction: "explicit",
							conflicts: null,
							hasPlanChange: true,
						},
					],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants preview: preview_update writes nothing")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_prv_nowrite");
		const variantId = uniqueTestId("cv2_var_prv_nowrite_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await autumnV2_3.catalogV2.previewUpdate({
				plans: [
					{
						plan_id: baseId,
						items: [messagesItem(100), dashboardItem()],
						propagate: { variants: [{ plan_id: variantId, version: 1 }] },
					},
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				allowances: { [TestFeature.Messages]: 200 },
				featureIds: [TestFeature.Messages],
			});
			expect(
				(await autumnV2_3.catalogV2.get()).plans.find(
					(plan: { id: string }) => plan.id === variantId,
				),
			).toBeUndefined();
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants preview: version strategies classify every variant version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_prv_all");
		const variantId = uniqueTestId("cv2_var_prv_all_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await seedVariantNewVersion({ autumn: autumnV2_3, variantId });

			const existing = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							propagate: { variants: [{ plan_id: variantId, version: 2 }] },
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: existing,
				expected: {
					planId: baseId,
					variants: [
						{
							planId: variantId,
							version: 2,
							variantAction: "propagated",
							hasPlanChange: true,
							versioning: {
								current_version: 2,
								new_version: null,
								resolved: "existing",
								options: ["existing", "all_versions"],
							},
							siblingVersions: [
								{
									version: 1,
									variantAction: "unchanged",
									hasPlanChange: false,
								},
							],
						},
					],
				},
			});

			const existingConflict = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(150)],
							propagate: { variants: [{ plan_id: variantId, version: 2 }] },
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: existingConflict,
				expected: {
					planId: baseId,
					variants: [
						{
							planId: variantId,
							version: 2,
							variantAction: "propagated",
							conflicts: [messagesValueDivergence],
							siblingVersions: [
								{
									version: 1,
									variantAction: "unchanged",
									conflicts: [messagesValueDivergence],
								},
							],
						},
					],
				},
			});

			const allVersions = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							versioning: "all_versions",
							propagate: {
								variants: [
									{ plan_id: variantId, version: 1 },
									{ plan_id: variantId, version: 2 },
								],
							},
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: allVersions,
				expected: {
					planId: baseId,
					variants: [
						{
							planId: variantId,
							version: 2,
							variantAction: "propagated",
							hasPlanChange: true,
							versioning: {
								current_version: 2,
								new_version: null,
								resolved: "all_versions",
								options: ["existing", "all_versions"],
							},
							siblingVersions: [
								{
									version: 1,
									variantAction: "propagated",
									hasPlanChange: true,
								},
							],
						},
					],
				},
			});

			const pinnedVersion = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							versioning: "all_versions",
							propagate: {
								variants: [{ plan_id: variantId, version: 1 }],
							},
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: pinnedVersion,
				expected: {
					planId: baseId,
					variants: [
						{
							planId: variantId,
							version: 2,
							variantAction: "unchanged",
							hasPlanChange: false,
							versioning: {
								current_version: 2,
								new_version: null,
								resolved: "all_versions",
								options: ["existing", "all_versions"],
							},
							siblingVersions: [
								{
									version: 1,
									variantAction: "propagated",
									hasPlanChange: true,
								},
							],
						},
					],
				},
			});

			const newVersionFallback = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							versioning: "new_version", active: true,
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: newVersionFallback,
				expected: {
					planId: baseId,
					variants: [
						{
							planId: variantId,
							version: 2,
							variantAction: "propagated",
							versioning: {
								current_version: 2,
								new_version: null,
								resolved: "existing",
								options: ["existing", "all_versions"],
							},
							siblingVersions: [{ version: 1, variantAction: "unchanged" }],
						},
					],
				},
			});

			await seedVersionableCustomer({
				ctx,
				planId: variantId,
				version: 2,
			});
			const newVersion = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							versioning: "new_version", active: true,
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: newVersion,
				expected: {
					planId: baseId,
					variants: [
						{
							planId: variantId,
							version: 3,
							versioning: {
								current_version: 2,
								new_version: 3,
								resolved: "new_version",
								options: ["existing", "new_version", "all_versions"],
							},
							siblingVersions: [
								{
									version: 1,
									variantAction: "unchanged",
									hasPlanChange: false,
								},
								{
									version: 2,
									variantAction: "propagated",
								},
							],
						},
					],
				},
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [baseId, variantId] });
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants preview: variants[] only lists rows anchored to the edited base")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_prv_anc");
		const euAId = uniqueTestId("cv2_var_prv_anc_a");
		const euBId = uniqueTestId("cv2_var_prv_anc_b");
		await deleteDbPlans({ ctx, planIds: [baseId, euAId, euBId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId: euAId,
			});
			await seedDivergedVariantBase({ autumn: autumnV2_3, baseId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [{ variant_plan_id: euBId, name: "Team B" }],
					},
				],
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(50), dashboardItem()],
							propagate: { variants: [{ plan_id: euBId, version: 1 }] },
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: baseId,
					variants: [
						{
							planId: euBId,
							variantAction: "propagated",
							hasPlanChange: true,
						},
					],
					siblingVersions: [
						{
							version: 1,
							variants: [
								{
									planId: euAId,
									version: 1,
									variantAction: "unchanged",
								},
							],
						},
					],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, euAId, euBId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants preview: discover lists every other-anchor version on sibling_versions")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_prv_disc");
		const variantId = uniqueTestId("cv2_var_prv_disc_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await seedVariantNewVersion({ autumn: autumnV2_3, variantId });
			await seedDivergedVariantBase({ autumn: autumnV2_3, baseId });
			await seedVariantNewVersion({ autumn: autumnV2_3, variantId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						version: 2,
						variants: [{ variant_plan_id: variantId, version: 3 }],
					},
				],
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(50), dashboardItem()],
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: baseId,
					variants: [
						{
							planId: variantId,
							version: 3,
							variantAction: "unchanged",
						},
					],
					siblingVersions: [
						{
							version: 1,
							variants: [
								{
									planId: variantId,
									version: 2,
									variantAction: "unchanged",
									siblingVersions: [
										{ version: 1, variantAction: "unchanged" },
									],
								},
							],
						},
					],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants preview: all_versions nests other-anchor variants on sibling_versions")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_prv_sib");
		const euAId = uniqueTestId("cv2_var_prv_sib_a");
		const euBId = uniqueTestId("cv2_var_prv_sib_b");
		await deleteDbPlans({ ctx, planIds: [baseId, euAId, euBId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId: euAId,
			});
			await seedDivergedVariantBase({ autumn: autumnV2_3, baseId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [{ variant_plan_id: euBId, name: "Team B" }],
					},
				],
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(50), dashboardItem()],
							versioning: "all_versions",
							propagate: {
								variants: [
									{ plan_id: euAId, version: 1 },
									{ plan_id: euBId, version: 1 },
								],
							},
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: baseId,
					variants: [
						{
							planId: euBId,
							variantAction: "propagated",
							hasPlanChange: true,
						},
					],
					siblingVersions: [
						{
							version: 1,
							variants: [
								{
									planId: euAId,
									version: 1,
									variantAction: "propagated",
								},
							],
						},
					],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, euAId, euBId] });
		}
	},
);
