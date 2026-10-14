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

test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-free-trial: add trial → customize.free_trial")}`,
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

test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-free-trial: duration_length / duration_type change")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cft_dur");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
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

test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-free-trial: card_required flip vs explicit false ≡ omit")}`,
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
								card_required: false,
							},
						},
					],
				}),
			);
			const row = findPlanPreviewRow({ preview: noDiff, planId });
			if (row.plan_change?.customize?.free_trial !== undefined) {
				throw new Error(
					"explicit card_required:false must not produce free_trial diff",
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
								card_required: true,
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
							card_required: true,
						},
					},
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-free-trial: on_end change vs explicit bill ≡ omit")}`,
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
			if (noDiffRow.plan_change?.customize?.free_trial !== undefined) {
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

test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-free-trial: remove trial → customize.free_trial null")}`,
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
