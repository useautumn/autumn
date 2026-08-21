/**
 * catalogV2.preview_update — sibling_versions[].conflicts reasons beyond
 * included-amount drift. Detector rules, on the unselected sibling.
 *
 * Contract:
 *   - v1 yearly messages vs v2 monthly bump → different_interval
 *   - v1 $200/year vs v2 $20→$25/mo → base_price_divergence (no item_filter)
 *   - edit only words; v1 diverged on messages → no conflicts
 */

import { test } from "bun:test";
import { BillingInterval, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
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
	seedTwoPlanVersions,
	wordsItem,
} from "./utils.js";

const year200 = { amount: 200, interval: BillingInterval.Year };
const month20 = { amount: 20, interval: BillingInterval.Month };
const month25 = { amount: 25, interval: BillingInterval.Month };

test.concurrent(
	`${chalk.yellowBright("catalogV2 sibling conflicts: yearly v1 vs monthly edit is different_interval")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_sib_c_int");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedTwoPlanVersions({
				autumn: autumnV2_3,
				planId,
				v1Items: [messagesItem(100, ResetInterval.Year)],
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
							conflicts: [
								{
									reason: "different_interval",
									feature_name: "Messages",
									item_filter: {
										feature_id: TestFeature.Messages,
										interval: ResetInterval.Year,
									},
								},
							],
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
	`${chalk.yellowBright("catalogV2 sibling conflicts: drifted base price is base_price_divergence")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_sib_c_bp");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedTwoPlanVersions({
				autumn: autumnV2_3,
				planId,
				v1Items: [],
				v2Items: [],
				v1Price: year200,
				v2Price: month20,
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, price: month25 }],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					siblingVersions: [
						{
							version: 1,
							conflicts: [{ reason: "base_price_divergence" }],
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
	`${chalk.yellowBright("catalogV2 sibling conflicts: unrelated feature edit ignores messages drift")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_sib_c_unrel");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedTwoPlanVersions({
				autumn: autumnV2_3,
				planId,
				v1Items: [messagesItem(500), wordsItem(10)],
				v2Items: [messagesItem(100), wordsItem(10)],
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							items: [messagesItem(100), wordsItem(20)],
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
