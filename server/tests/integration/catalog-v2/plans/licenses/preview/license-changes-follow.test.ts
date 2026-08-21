/**
 * catalogV2.preview_update — in-batch pin / propagate on the parent row.
 *
 * The parent is a direct plans[] entry so license_changes land on its
 * plan_change. Absent-parent fan-out is license_parents (not built).
 *
 * Contract:
 *   - pin (no propagate) → updated freeze, no nested plan_change
 *   - propagate → updated + nested item plan_change
 *   - child new_version + pin → previous_attributes.version
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
	messagesItem,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_changes: in-batch pin freezes the link")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lc_pin_p");
		const childId = uniqueTestId("cv2_lc_pin_c");
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
						planId: parentId,
						licenseChanges: [
							{
								action: "updated",
								license_plan_id: childId,
								previous_attributes: null,
								plan_change: null,
							},
						],
						customize: {
							upsert_licenses: [{ license_plan_id: childId }],
						},
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_changes: in-batch propagate nests child item plan_change")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lc_prop_p");
		const childId = uniqueTestId("cv2_lc_prop_c");
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
								propagate: { license_parents: [{ plan_id: parentId }] },
							},
							{ plan_id: parentId },
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
								plan_change: {},
							},
						],
						customize: {
							upsert_licenses: [{ license_plan_id: childId }],
						},
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_changes: child new_version + pin reports previous version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lc_ver_p");
		const childId = uniqueTestId("cv2_lc_ver_c");
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
								versioning: "new_version",
							},
							{ plan_id: parentId },
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
								previous_attributes: { version: 1 },
							},
						],
					},
				});
			},
		});
	},
);
