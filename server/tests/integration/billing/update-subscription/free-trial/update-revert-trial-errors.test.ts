/**
 * billing.update can only adjust a revert trial in place. Starting, converting or
 * removing one changes which plan owns the Stripe subscription, so it is rejected.
 *
 * Red (before):  each request is accepted and writes to the shared subscription.
 * Green (after): each request is rejected and the subscription is untouched.
 */

import { test } from "bun:test";
import {
	ErrCode,
	FreeTrialDuration,
	ms,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	EXTENDED_TRIAL_DAYS,
	expectRevertTrialAfterUpdate,
	setupRevertTrial,
	TRIAL_DAYS,
} from "./utils/revertTrialUtils";

test.concurrent(
	`${chalk.yellowBright("update-revert-trial-errors 1: convert to bill or remove revert trial — rejected")}`,
	async () => {
		const customerId = "upd-revert-trial-errors";
		const {
			autumnV2_3,
			ctx,
			advancedTo,
			pro,
			enterprise,
			trialCustomerProduct,
			subscriptionBefore,
		} = await setupRevertTrial({ customerId });

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "Cannot change on_end of a revert trial",
			func: () =>
				autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
					customer_id: customerId,
					subscription_id: trialCustomerProduct.id,
					customize: {
						free_trial: {
							duration_length: EXTENDED_TRIAL_DAYS,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
							on_end: "bill",
						},
					},
				}),
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "Cannot remove a revert trial",
			func: () =>
				autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
					customer_id: customerId,
					subscription_id: trialCustomerProduct.id,
					customize: { free_trial: null },
				}),
		});

		await expectRevertTrialAfterUpdate({
			ctx,
			customerId,
			trialProductId: enterprise.id,
			pausedProductId: pro.id,
			subscriptionBefore,
			expectedTrialEndsAt: advancedTo + ms.days(TRIAL_DAYS),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update-revert-trial-errors 2: start revert trial via update — rejected")}`,
	async () => {
		const customerId = "upd-revert-trial-start";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "on_end: 'revert' can only be set when attaching a plan",
			func: () =>
				autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
					customer_id: customerId,
					plan_id: pro.id,
					customize: {
						free_trial: {
							duration_length: TRIAL_DAYS,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
							on_end: "revert",
						},
					},
				}),
		});
	},
);
