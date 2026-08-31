/**
 * catalogV2 — atmn PUT lanes that the four-row Dashboard compose does not cover.
 *
 * Contract:
 *   G  Dashboard only on child v2 → parent v1 unchanged; parent v2 gets it
 *   H  preview: both parents license_action explicit; license_changes add
 *      Dashboard; no unlink
 *   I  restated overlays (v1=80, v2=40) stay; Dashboard still flows
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import {
	atmnDirectPut,
	expectAnchoredParentLink,
	expectChildVersionItems,
	seedDivergedChildAnchors,
} from "../utils/atmnPutDirectVersions.js";
import {
	getFullPlan,
	messagesItem,
	messagesOverride,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

const seedParentOverlays = async ({
	autumn,
	childId,
	parentId,
}: {
	autumn: Parameters<typeof seedDivergedChildAnchors>[0]["autumn"];
	childId: string;
	parentId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: parentId,
				version_slug: "v1",
				licenses: [
					{
						license_plan_id: childId,
						included: 2,
						version_slug: "v1",
						customize: messagesOverride(80),
					},
				],
			},
			{
				plan_id: parentId,
				version_slug: "v2",
				licenses: [
					{
						license_plan_id: childId,
						included: 2,
						version_slug: "v2",
						customize: messagesOverride(40),
					},
				],
			},
		],
	});
};

const expectExplicitDashboardPreview = ({
	preview,
	childId,
	parentId,
}: {
	preview: ReturnType<typeof parsePlanPreview>;
	childId: string;
	parentId: string;
}) => {
	for (const currentVersion of [1, 2] as const) {
		expectPlanPreviewRowCorrect({
			preview,
			expected: {
				planId: childId,
				currentVersion,
				licenseParents: [
					{
						planId: parentId,
						version: currentVersion,
						licenseAction: "explicit",
						licenseChanges: [
							{
								action: "updated",
								license_plan_id: childId,
								plan_change: {},
							},
						],
						nestedItemChanges: [
							{
								action: "created",
								feature_id: TestFeature.Dashboard,
							},
						],
					},
				],
			},
		});
		expectPlanPreviewRowCorrect({
			preview,
			expected: {
				planId: parentId,
				currentVersion,
				licenseChanges: [
					{
						action: "updated",
						license_plan_id: childId,
						plan_change: {},
					},
				],
			},
		});
		const parentRow = preview.plans.find(
			(row) =>
				row.plan_id === parentId && row.version === currentVersion,
		);
		expect(
			parentRow?.plan_change?.license_changes?.some(
				(change) => change.action === "removed",
			),
		).toBe(false);
		expect(parentRow?.plan_change?.customize?.remove_licenses).toBeUndefined();
	}
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: atmn PUT Dashboard on child v2 only does not leak to v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_atmn_g_c");
		const parentId = uniqueTestId("cv2_lic_atmn_g_p");
		await withCatalogPlans({
			ctx,
			planIds: [childId, parentId],
			run: async () => {
				await seedDivergedChildAnchors({
					autumn: autumnV2_3,
					childId,
					parentId,
				});
				const childV1 = await getFullPlan({ ctx, planId: childId, version: 1 });
				const childV2 = await getFullPlan({ ctx, planId: childId, version: 2 });

				await autumnV2_3.catalogV2.update({
					plans: atmnDirectPut({
						childId,
						parentId,
						childV1Items: [messagesItem(100)],
					}),
				});

				await expectChildVersionItems({
					ctx,
					childId,
					version: 1,
					messagesAllowance: 100,
					hasDashboard: false,
					hasWords: false,
				});
				await expectChildVersionItems({
					ctx,
					childId,
					version: 2,
					messagesAllowance: 50,
					hasDashboard: true,
					hasWords: true,
				});
				await expectAnchoredParentLink({
					ctx,
					childId,
					parentId,
					parentVersion: 1,
					childInternalId: childV1.internal_id,
					childVersion: 1,
					expected: { messagesAllowance: 100 },
				});
				await expectAnchoredParentLink({
					ctx,
					childId,
					parentId,
					parentVersion: 2,
					childInternalId: childV2.internal_id,
					childVersion: 2,
					expected: {
						messagesAllowance: 50,
						hasDashboard: true,
						hasWords: true,
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: atmn PUT preview is explicit and does not unlink")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_atmn_h_c");
		const parentId = uniqueTestId("cv2_lic_atmn_h_p");
		await withCatalogPlans({
			ctx,
			planIds: [childId, parentId],
			run: async () => {
				await seedDivergedChildAnchors({
					autumn: autumnV2_3,
					childId,
					parentId,
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: atmnDirectPut({ childId, parentId }),
					}),
				);
				expectExplicitDashboardPreview({ preview, childId, parentId });
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: atmn PUT restates overlays and still flows Dashboard")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_atmn_i_c");
		const parentId = uniqueTestId("cv2_lic_atmn_i_p");
		await withCatalogPlans({
			ctx,
			planIds: [childId, parentId],
			run: async () => {
				await seedDivergedChildAnchors({
					autumn: autumnV2_3,
					childId,
					parentId,
				});
				await seedParentOverlays({
					autumn: autumnV2_3,
					childId,
					parentId,
				});
				const childV1 = await getFullPlan({ ctx, planId: childId, version: 1 });
				const childV2 = await getFullPlan({ ctx, planId: childId, version: 2 });

				await autumnV2_3.catalogV2.update({
					plans: atmnDirectPut({
						childId,
						parentId,
						parentV1Customize: messagesOverride(80),
						parentV2Customize: messagesOverride(40),
					}),
				});

				await expectChildVersionItems({
					ctx,
					childId,
					version: 1,
					messagesAllowance: 100,
					hasDashboard: true,
					hasWords: false,
				});
				await expectChildVersionItems({
					ctx,
					childId,
					version: 2,
					messagesAllowance: 50,
					hasDashboard: true,
					hasWords: true,
				});
				await expectAnchoredParentLink({
					ctx,
					childId,
					parentId,
					parentVersion: 1,
					childInternalId: childV1.internal_id,
					childVersion: 1,
					expected: {
						messagesAllowance: 80,
						customized: true,
						hasDashboard: true,
					},
				});
				await expectAnchoredParentLink({
					ctx,
					childId,
					parentId,
					parentVersion: 2,
					childInternalId: childV2.internal_id,
					childVersion: 2,
					expected: {
						messagesAllowance: 40,
						customized: true,
						hasDashboard: true,
						hasWords: true,
					},
				});
			},
		});
	},
);
