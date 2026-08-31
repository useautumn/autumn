/**
 * catalogV2.preview_update — child's license_parents[] lane.
 *
 * Each reverse-link parent nests under the child with license_action
 * (unchanged | propagated | explicit) and the FINAL license edit:
 * propagate first, then declared licenses[] customize.
 *
 * Contract:
 *   - parent licenses[] item override → explicit; customize is declared
 *     (not the child's propagated items); child-only additions still flow
 *   - propagate-only parent → propagated
 *   - pin (no propagate, no licenses[]) → unchanged
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
import {
	dashboardItem,
	messagesItem,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

const declaredMessagesOverride = {
	remove_items: [{ feature_id: TestFeature.Messages }],
	add_items: [messagesItem(300)],
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_parents: declared item override is explicit + final customize")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lp_decl_p");
		const childId = uniqueTestId("cv2_lp_decl_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: childId,
								items: [messagesItem(200), dashboardItem()],
								propagate: { license_parents: [{ plan_id: parentId, version: 1 }] },
							},
							{
								plan_id: parentId,
								licenses: [
									{
										license_plan_id: childId,
										included: 2,
										customize: declaredMessagesOverride,
									},
								],
							},
						],
					}),
				);

				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: childId,
						licenseParents: [
							{
								planId: parentId,
								licenseAction: "explicit",
								customize: {
									upsert_licenses: [
										{
											license_plan_id: childId,
											included: 2,
											customize: {
												remove_items: [
													{ feature_id: TestFeature.Messages },
												],
												add_items: [
													{
														feature_id: TestFeature.Messages,
														included: 300,
													},
												],
											},
										},
									],
								},
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
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_parents: propagate-only parent is propagated")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lp_prop_p");
		const childId = uniqueTestId("cv2_lp_prop_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: childId,
								items: [messagesItem(200)],
								propagate: { license_parents: [{ plan_id: parentId, version: 1 }] },
							},
							{ plan_id: parentId, version: 1 },
						],
					}),
				);

				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: childId,
						licenseParents: [
							{
								planId: parentId,
								licenseAction: "propagated",
								licenseChanges: [
									{
										action: "updated",
										license_plan_id: childId,
										previous_attributes: null,
										plan_change: {},
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
	`${chalk.yellowBright("catalogV2 license_parents: pin (no propagate) is unchanged")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lp_pin_p");
		const childId = uniqueTestId("cv2_lp_pin_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{ plan_id: childId, items: [messagesItem(200)] },
							{ plan_id: parentId },
						],
					}),
				);

				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: childId,
						licenseParents: [
							{
								planId: parentId,
								licenseAction: "unchanged",
							},
						],
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_parents: absent-parent pin is unchanged with no conflict")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lp_abs_p");
		const childId = uniqueTestId("cv2_lp_abs_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [{ plan_id: childId, items: [messagesItem(200)] }],
					}),
				);

				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: childId,
						licenseParents: [
							{
								planId: parentId,
								licenseAction: "unchanged",
								conflicts: null,
							},
						],
					},
				});
			},
		});
	},
);
