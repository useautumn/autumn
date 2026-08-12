/**
 * catalogV2.preview_update — customize.free_trial lane.
 *
 * RED twice: trial persistence AND changes are unimplemented. Spec asserts
 * freeTrialsEqual normalization (card_required true / on_end "bill" /
 * duration_type month ≡ omitted).
 */

import { test } from "bun:test";
import {
	BillingInterval,
	FreeTrialDuration,
	PreviewUpdateCatalogResponseSchema,
} from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";
import {
	expectPlanPreviewRowCorrect,
	findPlanPreviewRow,
	parsePlanPreview,
} from "../utils/expectPlanPreview.js";

const paidSeed = (planId: string) => ({
	plan_id: planId,
	name: "Trial Plan",
	price: { amount: 20, interval: BillingInterval.Month },
});

const trial14 = {
	duration_length: 14,
	duration_type: FreeTrialDuration.Day,
	card_required: false,
};

// RED
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-free-trial: add trial → customize.free_trial")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cft_add");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [paidSeed(planId)],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, free_trial: trial14 }],
				}),
			);
			PreviewUpdateCatalogResponseSchema.parse(preview);
			// Trial not in upsert op today → action may stay `none`; still require customize.
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					customize: { free_trial: trial14 },
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — duration_length / duration_type change
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-free-trial: duration_length / duration_type change")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cft_dur");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			// Seed via params even if persistence is broken — preview compare
			// still needs a desired→desired diff once wiring lands; until then RED.
			await autumnV2_3.catalogV2.update({
				plans: [{ ...paidSeed(planId), free_trial: trial14 }],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							free_trial: {
								duration_length: 30,
								duration_type: FreeTrialDuration.Day,
								card_required: false,
							},
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					customize: {
						free_trial: {
							duration_length: 30,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
						},
					},
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — card_required flip diffs; explicit true ≡ omitted → no trial diff
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-free-trial: card_required flip vs explicit true ≡ omit")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cft_card");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						...paidSeed(planId),
						free_trial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Day,
						},
					},
				],
			});

			const noDiff = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							free_trial: {
								duration_length: 14,
								duration_type: FreeTrialDuration.Day,
								card_required: true,
							},
						},
					],
				}),
			);
			// Once trial persists + changes wired: action none / no free_trial lane.
			// Today trial doesn't persist so this may look like an add — still RED.
			const row = findPlanPreviewRow({ preview: noDiff, planId });
			if (row.changes?.customize?.free_trial !== undefined) {
				throw new Error(
					"explicit card_required:true must not produce free_trial diff",
				);
			}

			const withDiff = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							free_trial: {
								duration_length: 14,
								duration_type: FreeTrialDuration.Day,
								card_required: false,
							},
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: withDiff,
				expected: {
					planId,
					customize: {
						free_trial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
						},
					},
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — on_end change; explicit "bill" ≡ omitted
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-free-trial: on_end change vs explicit bill ≡ omit")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cft_end");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						...paidSeed(planId),
						free_trial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
						},
					},
				],
			});

			const noDiff = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							free_trial: {
								duration_length: 14,
								duration_type: FreeTrialDuration.Day,
								card_required: false,
								on_end: "bill",
							},
						},
					],
				}),
			);
			const noDiffRow = findPlanPreviewRow({ preview: noDiff, planId });
			if (noDiffRow.changes?.customize?.free_trial !== undefined) {
				throw new Error(
					"explicit on_end:bill must not produce free_trial diff",
				);
			}

			const withDiff = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							free_trial: {
								duration_length: 14,
								duration_type: FreeTrialDuration.Day,
								card_required: false,
								on_end: "revert",
							},
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: withDiff,
				expected: {
					planId,
					customize: {
						free_trial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
							on_end: "revert",
						},
					},
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-free-trial: remove trial → customize.free_trial null")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cft_rm");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ ...paidSeed(planId), free_trial: trial14 }],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, free_trial: null }],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					customize: { free_trial: null },
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
