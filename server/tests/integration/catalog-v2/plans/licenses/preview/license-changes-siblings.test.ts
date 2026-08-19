/**
 * catalogV2.preview_update / update — all_versions sibling license_changes
 * replay the latest license DIFF, not a PUT of the latest overlay.
 *
 * Red (current):  all_versions copies latest licenses[] onto v1 (100→200)
 * Green (after):  v1 keeps 100 Messages and only gains Dashboard
 */
import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import { expectLicenseLinkCorrect } from "../utils/expectLicenseLinkCorrect.js";
import {
	dashboardItem,
	messagesItem,
	messagesOverride,
	seedTwoParentVersions,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

const overlayWithDashboard = (included: number) => ({
	remove_items: [{ feature_id: TestFeature.Messages }],
	add_items: [messagesItem(included), dashboardItem()],
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_changes: all_versions declared write does not drift on siblings")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lc_sib_p");
		const childId = uniqueTestId("cv2_lc_sib_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: parentId,
							version: 1,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: messagesOverride(500),
								},
							],
						},
					],
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: parentId,
								versioning: "all_versions",
								licenses: [
									{
										license_plan_id: childId,
										included: 2,
										customize: messagesOverride(300),
									},
								],
							},
						],
					}),
				);

				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: parentId,
						licenseChanges: [
							{
								action: "updated",
								license_plan_id: childId,
							},
						],
						siblingVersions: [
							{
								version: 1,
								licenseChanges: [
									{
										action: "updated",
										license_plan_id: childId,
									},
								],
							},
						],
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_changes: all_versions add boolean does not PUT latest overlay onto v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lc_sib_diff_p");
		const childId = uniqueTestId("cv2_lc_sib_diff_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: parentId,
							version: 1,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: messagesOverride(100),
								},
							],
						},
					],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: parentId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: messagesOverride(200),
								},
							],
						},
					],
				});

				const plans = [
					{
						plan_id: parentId,
						versioning: "all_versions" as const,
						licenses: [
							{
								license_plan_id: childId,
								included: 2,
								customize: overlayWithDashboard(200),
							},
						],
					},
				];
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({ plans }),
				);
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: parentId,
						versioningOptions: ["all_versions", "existing"],
						licenseChanges: [
							{
								action: "updated",
								license_plan_id: childId,
								plan_change: {
									item_changes: [
										{
											action: "created",
											feature_id: TestFeature.Dashboard,
										},
									],
								},
							},
						],
						siblingVersions: [
							{
								version: 1,
								conflicts: null,
								licenseChanges: [
									{
										action: "updated",
										license_plan_id: childId,
										plan_change: {
											item_changes: [
												{
													action: "created",
													feature_id: TestFeature.Dashboard,
												},
											],
										},
									},
								],
							},
						],
					},
				});

				await autumnV2_3.catalogV2.update({ plans });
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
					licensePlanId: childId,
					messagesAllowance: 100,
					entitlements: [{ feature_id: TestFeature.Dashboard }],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					messagesAllowance: 200,
					entitlements: [{ feature_id: TestFeature.Dashboard }],
				});
			},
		});
	},
);
