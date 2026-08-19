/**
 * catalogV2.update — variants inherit the parent plans[] versioning strategy.
 *
 * Contract:
 *   existing (default) → latest only
 *   all_versions → every existing variant version gets the DIFF
 *   new_version + customers on latest → mint max+1
 *   new_version + no customers → edit latest in place
 *   propagate.variants[].versioning is ignored
 *   all_versions add of a continuous-use feature the variant v1 already has
 *     → skip v1 (no second item, no overwrite); latest still receives the add
 */

import { expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
import {
	dashboardItem,
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import {
	expectVariantPlanCorrect,
	getFullPlan,
} from "../utils/expectVariantPointer.js";
import {
	seedBaseWithVariant,
	seedVariantNewVersion,
} from "../utils/seedVariantPlans.js";

const workflowsItem = (included: number) => ({
	feature_id: TestFeature.Workflows,
	included,
	reset: { interval: ResetInterval.Month },
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagated existing writes latest only; v1 stays frozen")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_ver_ex");
		const variantId = uniqueTestId("cv2_var_ver_ex_eu");
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
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 1,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 2,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagated all_versions writes v1 and latest")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_ver_all");
		const variantId = uniqueTestId("cv2_var_ver_all_eu");
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
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							versioning: "all_versions",
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 1,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 2,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagated new_version mints max+1 when latest has customers")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_ver_nv");
		const variantId = uniqueTestId("cv2_var_ver_nv_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							versioning: "new_version",
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 1,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 2,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagated new_version without customers edits latest in place")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_ver_nv0");
		const variantId = uniqueTestId("cv2_var_ver_nv0_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							versioning: "new_version",
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 1,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: parent existing ignores propagate.variants versioning")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_ver_ign");
		const variantId = uniqueTestId("cv2_var_ver_ign_eu");
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
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							propagate: {
								variants: [
									{ plan_id: variantId, versioning: "all_versions" },
								],
							},
						},
					],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 1,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 2,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: all_versions add workflows onto a v1 that already has 100")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_ver_wf");
		const variantId = uniqueTestId("cv2_var_ver_wf_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: baseId, versioning: "new_version" }],
				});
				await seedVariantNewVersion({ autumn: autumnV2_3, variantId });
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: variantId,
							version: 1,
							items: [messagesItem(200), workflowsItem(100)],
						},
					],
				});

				const workflowsOnly = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: baseId,
								items: [messagesItem(100), workflowsItem(200)],
								versioning: "all_versions",
								propagate: { variants: [{ plan_id: variantId }] },
							},
						],
					}),
				);
				expectPlanPreviewRowCorrect({
					preview: workflowsOnly,
					expected: {
						planId: baseId,
						variants: [
							{
								planId: variantId,
								version: 2,
								variantAction: "propagated",
								hasPlanChange: true,
								siblingVersions: [
									{
										version: 1,
										variantAction: "propagated",
										hasPlanChange: false,
										conflicts: null,
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
							items: [
								messagesItem(100),
								workflowsItem(200),
								dashboardItem(),
							],
							versioning: "all_versions",
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				});

				const variantV1 = await getFullPlan({
					ctx,
					planId: variantId,
					version: 1,
				});
				const workflowEnts = variantV1.entitlements.filter(
					(entitlement) => entitlement.feature_id === TestFeature.Workflows,
				);
				expect(workflowEnts).toHaveLength(1);
				expect(workflowEnts[0]?.allowance).toBe(100);

				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 1,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [
						TestFeature.Messages,
						TestFeature.Workflows,
						TestFeature.Dashboard,
					],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 2,
					allowances: {
						[TestFeature.Messages]: 200,
						[TestFeature.Workflows]: 200,
					},
					featureIds: [
						TestFeature.Messages,
						TestFeature.Workflows,
						TestFeature.Dashboard,
					],
				});
			},
		});
	},
);
