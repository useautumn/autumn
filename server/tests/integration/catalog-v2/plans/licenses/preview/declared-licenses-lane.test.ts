/**
 * catalogV2.preview_update — licenses lane on a direct parent row.
 *
 * Declared licenses[] renders the planned post-update set; omitting the key
 * echoes current links unchanged. License create/remove also lands on
 * plan_change.license_changes + customize.upsert_licenses / remove_licenses.
 * A brand-new parent has no from-product, so plan_change (and license_changes)
 * is omitted — only the licenses after-set is present.
 */

import { expect, test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import {
	messagesItem,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses preview: declared set vs omitted key")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_prev_p");
		const childA = uniqueTestId("cv2_lic_prev_a");
		const childB = uniqueTestId("cv2_lic_prev_b");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childA, childB],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childA,
							name: "Seat A",
							items: [messagesItem(10)],
						},
						{
							plan_id: childB,
							name: "Seat B",
							items: [messagesItem(5)],
						},
						{
							plan_id: parentId,
							name: "Parent",
							licenses: [{ license_plan_id: childA, included: 1 }],
						},
					],
				});

				const omitted = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [{ plan_id: parentId, name: "Parent Renamed" }],
					}),
				);
				expectPlanPreviewRowCorrect({
					preview: omitted,
					expected: {
						planId: parentId,
						action: "update",
						licenses: [
							{
								license_plan_id: childA,
								version: 1,
								version_slug: "v1",
								included: 1,
								prepaid_only: true,
							},
						],
						licenseChanges: null,
					},
				});

				const declared = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: parentId,
								licenses: [{ license_plan_id: childB, included: 3 }],
							},
						],
					}),
				);
				expectPlanPreviewRowCorrect({
					preview: declared,
					expected: {
						planId: parentId,
						licenses: [
							{
								license_plan_id: childB,
								version: 1,
								version_slug: "v1",
								included: 3,
								prepaid_only: true,
							},
						],
						licenseChanges: [
							{
								action: "created",
								license_plan_id: childB,
								included: 3,
								previous_attributes: null,
							},
							{
								action: "removed",
								license_plan_id: childA,
								included: 1,
								previous_attributes: null,
							},
						],
						customize: {
							upsert_licenses: [{ license_plan_id: childB, included: 3 }],
							remove_licenses: [{ license_plan_id: childA }],
						},
					},
				});
				expect(
					declared.plans.find((p) => p.plan_id === parentId)?.licenses,
				).not.toEqual(
					omitted.plans.find((p) => p.plan_id === parentId)?.licenses,
				);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses preview: create parent + child shows licenses lane")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_prev_create_p");
		const childId = uniqueTestId("cv2_lic_prev_create_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: childId,
								name: "Seat",
								items: [messagesItem(10)],
							},
							{
								plan_id: parentId,
								name: "Parent",
								licenses: [{ license_plan_id: childId, included: 2 }],
							},
						],
					}),
				);
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: parentId,
						action: "create",
						planChange: null,
						licenseChanges: null,
						licenses: [
							{
								license_plan_id: childId,
								version: 1,
								version_slug: "v1",
								included: 2,
								prepaid_only: true,
							},
						],
					},
				});
			},
		});
	},
);
