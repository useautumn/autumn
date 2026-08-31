/**
 * catalogV2.update — propagate.variants write semantics from the source.
 * existing/all_versions targets pin rows; new_version targets are plan-level
 * ({ plan_id } only) and the server resolves active-else-latest anchored row.
 *
 * Contract:
 *   existing + pin latest → latest only
 *   pin every version → each pinned row gets ITS OWN anchor's diff
 *   new_version + plan-level target, resolved row w/ customers → mint max+1 (named by new_version_slug)
 *   new_version + latest-but-inactive resolved row w/ customers → mint (not 400)
 *   new_version + plan-level target, resolved row w/o customers → edit in place + repoint
 *   pin historical only → that row follows; latest frozen
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
import { expectVersionIdentityCorrect } from "../../utils/expectVersionIdentity.js";
import {
	expectVariantPlanCorrect,
	expectVariantPointerCorrect,
	getFullPlan,
} from "../utils/expectVariantPointer.js";
import {
	seedBaseWithVariant,
	seedDivergedVariantBase,
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
							propagate: {
								variants: [{ plan_id: variantId, version: 2 }],
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
							propagate: {
								variants: [
									{ plan_id: variantId, version: 1 },
									{ plan_id: variantId, version: 2 },
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
							versioning: "new_version", active: true,
							propagate: {
								variants: [
									{ plan_id: variantId, new_version_slug: "eu-mint" },
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
				await expectVersionIdentityCorrect({
					ctx,
					planId: variantId,
					version: 2,
					versionSlug: "eu-mint",
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: new_version mints from latest even when that row is inactive")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_ver_inact");
		const variantId = uniqueTestId("cv2_var_ver_inact_eu");
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
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							version: 2,
							variants: [{ variant_plan_id: variantId, version: 2 }],
						},
					],
				});
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: variantId, version: 1, active: true }],
				});
				await seedVersionableCustomer({
					ctx,
					planId: variantId,
					version: 2,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							versioning: "new_version",
							active: true,
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				});
				const frozen = await getFullPlan({
					ctx,
					planId: variantId,
					version: 2,
				});
				const minted = await getFullPlan({
					ctx,
					planId: variantId,
					version: 3,
				});
				expect(
					frozen.entitlements.map((row) => row.feature_id),
				).not.toContain(TestFeature.Dashboard);
				expect(minted.entitlements.map((row) => row.feature_id)).toContain(
					TestFeature.Dashboard,
				);
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					variantVersion: 3,
					basePlanId: baseId,
					baseVersion: 3,
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
							versioning: "new_version", active: true,
							propagate: {
								variants: [{ plan_id: variantId }],
							},
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
	`${chalk.yellowBright("catalogV2 variants: pin historical v1 follows; latest stays frozen")}`,
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
								variants: [{ plan_id: variantId, version: 1 }],
							},
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
					featureIds: [TestFeature.Messages],
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
					plans: [{ plan_id: baseId, versioning: "new_version", active: true }],
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
					preview: workflowsOnly,
					expected: {
						planId: baseId,
						variants: null,
						siblingVersions: [
							{
								version: 1,
								variants: [
									{
										planId: variantId,
										version: 2,
										variantAction: "propagated",
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
							propagate: {
								variants: [
									{ plan_id: variantId, version: 1 },
									{ plan_id: variantId, version: 2 },
								],
							},
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
