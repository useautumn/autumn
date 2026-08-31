/**
 * catalogV2.update — pinned variant rows receive THEIR OWN anchor's diff.
 * Off-anchor pins 400; omitted rows stay frozen. Historical rows never
 * relink just because the latest base was edited.
 *
 * Same-plan versions across base rows (EU v1+v2 on Team v1, EU v3 on
 * Team v2) are independently pinnable under all_versions. Discover
 * lists them on sibling_versions[].variants so the dashboard can pick.
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	dashboardItem,
	messagesItem,
	withCatalogPlans,
	wordsItem,
} from "../../licenses/utils/seedLicensePlans.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import {
	expectVariantPlanCorrect,
	expectVariantPointerCorrect,
} from "../utils/expectVariantPointer.js";
import {
	seedBaseWithTwoVariants,
	seedBaseWithVariant,
	seedDivergedVariantBase,
	seedVariantNewVersion,
} from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: pin follows only the row anchored to the edited base")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_anc_spl");
		const euAId = uniqueTestId("cv2_var_anc_spl_a");
		const euBId = uniqueTestId("cv2_var_anc_spl_b");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, euAId, euBId],
			run: async () => {
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
							variants: [
								{
									variant_plan_id: euBId,
									name: "Team B",
									customize: {
										remove_items: [{ feature_id: TestFeature.Messages }],
										add_items: [messagesItem(200)],
									},
								},
							],
						},
					],
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(50), wordsItem(10), dashboardItem()],
							propagate: {
								variants: [{ plan_id: euBId, version: 1 }],
							},
						},
					],
				});

				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: euAId,
					basePlanId: baseId,
					baseVersion: 1,
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: euAId,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages],
				});
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: euBId,
					basePlanId: baseId,
					baseVersion: 2,
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: euBId,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [
						TestFeature.Messages,
						TestFeature.Words,
						TestFeature.Dashboard,
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: all_versions pins each receive their own anchor's diff")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_anc_all");
		const euAId = uniqueTestId("cv2_var_anc_all_a");
		const euBId = uniqueTestId("cv2_var_anc_all_b");
		const euCId = uniqueTestId("cv2_var_anc_all_c");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, euAId, euBId, euCId],
			run: async () => {
				await seedBaseWithTwoVariants({
					autumn: autumnV2_3,
					baseId,
					variantIds: [euAId, euBId],
				});
				await seedDivergedVariantBase({ autumn: autumnV2_3, baseId });
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							variants: [
								{
									variant_plan_id: euCId,
									name: "Team C",
									customize: {
										remove_items: [{ feature_id: TestFeature.Messages }],
										add_items: [messagesItem(200)],
									},
								},
							],
						},
					],
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(50), wordsItem(10), dashboardItem()],
							versioning: "all_versions",
							propagate: {
								variants: [
									{ plan_id: euAId, version: 1 },
									{ plan_id: euBId, version: 1 },
									{ plan_id: euCId, version: 1 },
								],
							},
						},
					],
				});

				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: euAId,
					basePlanId: baseId,
					baseVersion: 1,
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: euAId,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: euBId,
					basePlanId: baseId,
					baseVersion: 1,
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: euBId,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: euCId,
					basePlanId: baseId,
					baseVersion: 2,
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: euCId,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [
						TestFeature.Messages,
						TestFeature.Words,
						TestFeature.Dashboard,
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: all_versions can pin any version of a split-anchor variant")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_anc_pin");
		const variantId = uniqueTestId("cv2_var_anc_pin_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
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

				const discover = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: baseId,
								items: [messagesItem(50), wordsItem(10), dashboardItem()],
							},
						],
					}),
				);
				expectPlanPreviewRowCorrect({
					preview: discover,
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

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(50), wordsItem(10), dashboardItem()],
							versioning: "all_versions",
							propagate: {
								variants: [{ plan_id: variantId, version: 2 }],
							},
						},
					],
				});

				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					variantVersion: 1,
					basePlanId: baseId,
					baseVersion: 1,
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 1,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages],
				});
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					variantVersion: 2,
					basePlanId: baseId,
					baseVersion: 1,
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 2,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					variantVersion: 3,
					basePlanId: baseId,
					baseVersion: 2,
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 3,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages],
				});
			},
		});
	},
);
