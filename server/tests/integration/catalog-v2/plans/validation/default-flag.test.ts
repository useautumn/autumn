/**
 * catalogV2.update — auto_enable / default-flag rules.
 *
 * Spec (validateDefaultFlag): only free plans and default-trial plans
 * (card_required: false) can be auto_enable. catalogV2 does not call
 * validateDefaultFlag yet → most REJECT cases are RED.
 */

import { test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	ErrCode,
	FreeTrialDuration,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectCatalogResultsCorrect } from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
} from "../utils/expectCatalogPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 default-flag: free plan auto_enable true → OK")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_def_free");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Free Default",
						auto_enable: true,
						group: `g_${planId}`,
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 10,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "create" }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, isDefault: true }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 default-flag: paid + cardless trial auto_enable → OK")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_def_trial");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Paid Trial Default",
						auto_enable: true,
						group: `g_${planId}`,
						price: { amount: 20, interval: BillingInterval.Month },
						free_trial: {
							duration_type: FreeTrialDuration.Day,
							duration_length: 14,
							card_required: false,
						},
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 10,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						isDefault: true,
						freeTrial: {
							duration_type: FreeTrialDuration.Day,
							duration_length: 14,
							card_required: false,
							on_end: null,
						},
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 default-flag: paid recurring no trial auto_enable → error")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_def_paid");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								name: "Paid Default",
								auto_enable: true,
								price: { amount: 20, interval: BillingInterval.Month },
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 default-flag: one-off priced auto_enable → error")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_def_oneoff");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								name: "One Off Default",
								auto_enable: true,
								items: [
									{
										feature_id: TestFeature.Messages,
										included: 0,
										price: {
											amount: 10,
											interval: BillingInterval.OneOff,
											billing_method: BillingMethod.Prepaid,
											billing_units: 1,
										},
									},
								],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 default-flag: auto_enable on pinned historical version → error")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_def_hist");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "V1" }],
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, version: 2, name: "V2" }],
			});

			await expectAutumnError({
				errCode: ErrCode.HistoricalPlanVersionCannotBeDefault,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								version: 1,
								auto_enable: true,
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 default-flag: defaults in different groups coexist")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planA = uniqueTestId("cv2_def_ga");
		const planB = uniqueTestId("cv2_def_gb");
		await deleteDbPlans({ ctx, planIds: [planA, planB] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planA,
						name: "Default A",
						auto_enable: true,
						group: `group_a_${planA}`,
						items: [{ feature_id: TestFeature.Dashboard }],
					},
					{
						plan_id: planB,
						name: "Default B",
						auto_enable: true,
						group: `group_b_${planB}`,
						items: [{ feature_id: TestFeature.Dashboard }],
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{ id: planA, isDefault: true, group: `group_a_${planA}` },
					{ id: planB, isDefault: true, group: `group_b_${planB}` },
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planA, planB] });
		}
	},
);
