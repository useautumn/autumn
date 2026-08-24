/**
 * catalogV2.preview_update — customize and mixed parent+license edits.
 *
 * Contract:
 *   - customize on an existing link → updated + nested core plan_change
 *   - new link with customize → created, no nested plan_change
 *   - parent name + included compose onto one plan_change
 *   - after new_version + license customize, a later preview_update parses
 *     and echoes the overlay (Dashboard) on latest
 */

import { test } from "bun:test";
import { BillingInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import {
	expectLatestPlanVersion,
	expectLicenseLinkCorrect,
} from "../utils/expectLicenseLinkCorrect.js";
import {
	dashboardItem,
	messagesItem,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

const seatPrice = { amount: 20, interval: BillingInterval.Month };

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_changes: customize on existing link nests plan_change")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lc_cust_p");
		const childId = uniqueTestId("cv2_lc_cust_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					included: 2,
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: parentId,
								licenses: [
									{
										license_plan_id: childId,
										included: 2,
										customize: {
											price: seatPrice,
											add_items: [itemsV2.monthlyWords({ included: 100 })],
										},
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
								previous_attributes: null,
								plan_change: {
									price_change: { previous: null, current: seatPrice },
								},
							},
						],
						customize: {
							upsert_licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: {
										price: seatPrice,
										add_items: [{ feature_id: TestFeature.Words }],
									},
								},
							],
						},
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_changes: new customized link is created, no nested plan_change")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lc_newc_p");
		const childId = uniqueTestId("cv2_lc_newc_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							name: "Seat",
							items: [messagesItem(10)],
						},
						{ plan_id: parentId, name: "Parent" },
					],
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: parentId,
								licenses: [
									{
										license_plan_id: childId,
										included: 2,
										customize: { price: seatPrice },
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
								action: "created",
								license_plan_id: childId,
								included: 2,
								previous_attributes: null,
								plan_change: null,
							},
						],
						customize: {
							upsert_licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: { price: seatPrice },
								},
							],
						},
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_changes: name + included compose on one plan_change")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lc_mix_p");
		const childId = uniqueTestId("cv2_lc_mix_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					included: 2,
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: parentId,
								name: "Parent Plus",
								licenses: [{ license_plan_id: childId, included: 5 }],
							},
						],
					}),
				);
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: parentId,
						previousAttributes: { name: "Parent" },
						licenseChanges: [
							{
								action: "updated",
								included: 5,
								previous_attributes: { included: 2 },
								plan_change: null,
							},
						],
						customize: {
							upsert_licenses: [{ license_plan_id: childId, included: 5 }],
						},
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_changes: preview after versioned license customize")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lc_vrcust_p");
		const childId = uniqueTestId("cv2_lc_vrcust_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: parentId,
							versioning: "new_version", active: true,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: { add_items: [dashboardItem()] },
								},
							],
						},
					],
				});

				await expectLatestPlanVersion({ ctx, planId: parentId, version: 2 });
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					included: 2,
					customized: true,
					entitlements: [{ feature_id: TestFeature.Dashboard }],
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [{ plan_id: parentId }],
					}),
				);
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: parentId,
						action: "none",
						licenses: [
							{
								license_plan_id: childId,
								version: 1,
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
