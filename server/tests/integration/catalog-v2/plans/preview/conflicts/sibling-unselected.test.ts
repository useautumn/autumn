/**
 * catalogV2.preview_update — sibling_versions[].conflicts before and after
 * all_versions is picked. atmn needs the list on the unselected checkbox.
 *
 * Contract:
 *   - v1 drifted (500 vs v2 current 100), edit 100→200, versioning omitted
 *     → v1 unselected, value_divergence
 *   - v1 tracks current 100 → no conflicts
 *   - all_versions still lists the same conflict (edit overwrites, still shown)
 */

import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../utils/expectPlanPreview.js";
import {
	messagesItem,
	messagesValueDivergence,
	seedTwoPlanVersions,
} from "./utils.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 sibling conflicts: unselected drifted v1 lists value_divergence")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_sib_c_drift");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedTwoPlanVersions({
				autumn: autumnV2_3,
				planId,
				v1Items: [messagesItem(500)],
				v2Items: [messagesItem(100)],
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, items: [messagesItem(200)] }],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					siblingVersions: [
						{
							version: 1,
							hasPlanChange: false,
							conflicts: [messagesValueDivergence],
						},
					],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 sibling conflicts: unselected tracking v1 has no conflicts")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_sib_c_track");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedTwoPlanVersions({
				autumn: autumnV2_3,
				planId,
				v1Items: [messagesItem(100)],
				v2Items: [messagesItem(100)],
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, items: [messagesItem(200)] }],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					siblingVersions: [
						{
							version: 1,
							conflicts: null,
						},
					],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 sibling conflicts: all_versions still lists the overwrite")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_sib_c_all");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedTwoPlanVersions({
				autumn: autumnV2_3,
				planId,
				v1Items: [messagesItem(500)],
				v2Items: [messagesItem(100)],
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							items: [messagesItem(200)],
							versioning: "all_versions",
						},
					],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					siblingVersions: [
						{
							version: 1,
							conflicts: [messagesValueDivergence],
						},
					],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
