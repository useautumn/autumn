/**
 * catalogV2.preview_update — declared licenses[] → plan_change.license_changes.
 *
 * Contract:
 *   - licenses: [] → removed + remove_licenses
 *   - included-only → updated, previous_attributes.included, no nested plan_change
 *   - identical re-declare → no license_changes
 */

import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import {
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_changes: licenses: [] removes the current link")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lc_clr_p");
		const childId = uniqueTestId("cv2_lc_clr_c");
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
						plans: [{ plan_id: parentId, licenses: [] }],
					}),
				);
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: parentId,
						action: "update",
						licenses: null,
						licenseChanges: [
							{
								action: "removed",
								license_plan_id: childId,
								included: 2,
								previous_attributes: null,
								plan_change: null,
							},
						],
						customize: {
							remove_licenses: [{ license_plan_id: childId }],
						},
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_changes: included-only update, no nested plan_change")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lc_inc_p");
		const childId = uniqueTestId("cv2_lc_inc_c");
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
								licenses: [{ license_plan_id: childId, included: 5 }],
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
	`${chalk.yellowBright("catalogV2 license_changes: identical licenses[] is a no-op")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lc_noop_p");
		const childId = uniqueTestId("cv2_lc_noop_c");
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
								licenses: [{ license_plan_id: childId, included: 2 }],
							},
						],
					}),
				);
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: parentId,
						action: "none",
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
