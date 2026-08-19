/**
 * catalogV2.update — free_trial projected-state validation.
 *
 * Spec: reject with 400; no silent is_default flips. Validation must see
 * projected plan state (same-call one-off + trial, default + carded trial).
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
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
} from "../utils/expectCatalogPlans.js";

const trialDay = ({
	length = 7,
	cardRequired = false,
}: {
	length?: number;
	cardRequired?: boolean;
} = {}) => ({
	duration_length: length,
	duration_type: FreeTrialDuration.Day,
	card_required: cardRequired,
});

// RED until validation is wired against projected state
test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial validation: trial on one-off create → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ftv_oo");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								name: "One Off Trial",
								free_trial: trialDay(),
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

// RED
test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial validation: add trial to existing one-off → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ftv_oo_add");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "One Off",
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
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								free_trial: trialDay(),
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — same-call projection: becoming one-off while keeping/adding trial
test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial validation: same-call one-off + trial → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ftv_proj");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Was Recurring",
						price: { amount: 20, interval: BillingInterval.Month },
						free_trial: trialDay({ cardRequired: false }),
					},
				],
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								price: null,
								free_trial: trialDay({ cardRequired: false }),
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

// RED — default + carded trial must 400 (not silent is_default flip)
test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial validation: default + card_required true → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ftv_def_card");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								name: "Default Carded Trial",
								auto_enable: true,
								group: `g_${planId}`,
								price: { amount: 20, interval: BillingInterval.Month },
								free_trial: trialDay({ cardRequired: true }),
								items: [
									{
										feature_id: TestFeature.Messages,
										included: 10,
										reset: { interval: ResetInterval.Month },
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

// RED — flip card_required false→true on default plan → 400
test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial validation: default trial card_required false→true → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ftv_flip");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Default Cardless",
						auto_enable: true,
						group: `g_${planId}`,
						price: { amount: 20, interval: BillingInterval.Month },
						free_trial: trialDay({ cardRequired: false }),
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
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								free_trial: trialDay({ cardRequired: true }),
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — remove trial from default paid plan (no longer default-trial eligible)
test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial validation: remove trial from default paid → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ftv_rm_def");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Default Paid Trial",
						auto_enable: true,
						group: `g_${planId}`,
						price: { amount: 20, interval: BillingInterval.Month },
						free_trial: trialDay({ cardRequired: false }),
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
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [{ plan_id: planId, free_trial: null }],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// Control: free default without trial → OK (may already be green)
test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial validation: free default without trial → OK")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ftv_free");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
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
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						isDefault: true,
						freeTrial: null,
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
