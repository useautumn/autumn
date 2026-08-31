/**
 * catalogV2.preview_update — license_parents[].conflicts for a customized
 * (or stock) reverse-link parent. Parent is absent from plans[] so atmn
 * sees the checkbox before propagate is filled.
 *
 * Contract:
 *   - customize messages=500, child 10→200, no propagate
 *     → unchanged + value_divergence (never 400)
 *   - same customize + propagate → propagated + same conflict
 *   - uncustomized + propagate → propagated, no conflicts
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../../preview/utils/expectPlanPreview.js";
import {
	messagesItem,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../../utils/seedLicensePlans.js";

const messagesOverride = {
	remove_items: [{ feature_id: TestFeature.Messages }],
	add_items: [messagesItem(500)],
};

const messagesValueDivergence = {
	reason: "value_divergence" as const,
	feature_name: "Messages",
	item_filter: { feature_id: TestFeature.Messages },
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_parents conflicts: pin + customize lists value_divergence")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lpc_pin_p");
		const childId = uniqueTestId("cv2_lpc_pin_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					customize: messagesOverride,
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
								conflicts: [messagesValueDivergence],
							},
						],
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_parents conflicts: propagate + customize still lists it")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lpc_prop_p");
		const childId = uniqueTestId("cv2_lpc_prop_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					customize: messagesOverride,
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: childId,
								items: [messagesItem(200)],
								propagate: { license_parents: [{ plan_id: parentId, version: 1 }] },
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
								licenseAction: "propagated",
								conflicts: [messagesValueDivergence],
							},
						],
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_parents conflicts: uncustomized follow has none")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lpc_stock_p");
		const childId = uniqueTestId("cv2_lpc_stock_c");
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
								conflicts: null,
							},
						],
					},
				});
			},
		});
	},
);
