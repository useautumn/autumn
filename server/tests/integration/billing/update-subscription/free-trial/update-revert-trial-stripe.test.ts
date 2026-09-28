/**
 * billing.update on an on_end: "revert" trial must stay Autumn-only, like attach.
 * The trial cusProduct shares the paused plan's Stripe subscription, so any Stripe
 * write lands on the customer's real paid subscription.
 *
 * Red (before):  extending the trial sets trial_end on the shared subscription
 *                (paid plan goes "trialing"); other updates push the trial plan's
 *                items onto it and drop the trial.
 * Green (after): the shared subscription is untouched and the revert trial keeps
 *                its trial window, on_trial_end and previous plan link.
 */

import { test } from "bun:test";
import { ms, type UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import {
	EXTENDED_TRIAL_DAYS,
	expectRevertTrialAfterUpdate,
	extendRevertTrial,
	setupRevertTrial,
	TRIAL_DAYS,
} from "./utils/revertTrialUtils";

test.concurrent(
	`${chalk.yellowBright("update-revert-trial-stripe 1: extend revert trial — shared Stripe sub untouched")}`,
	async () => {
		const customerId = "upd-revert-trial-extend";
		const {
			autumnV2_3,
			ctx,
			advancedTo,
			pro,
			enterprise,
			trialCustomerProduct,
			subscriptionBefore,
		} = await setupRevertTrial({ customerId });

		await extendRevertTrial({
			autumn: autumnV2_3,
			customerId,
			subscriptionId: trialCustomerProduct.id,
			onEnd: "revert",
		});

		await expectRevertTrialAfterUpdate({
			ctx,
			customerId,
			trialProductId: enterprise.id,
			pausedProductId: pro.id,
			subscriptionBefore,
			expectedTrialEndsAt: advancedTo + ms.days(EXTENDED_TRIAL_DAYS),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update-revert-trial-stripe 2: extend revert trial without on_end — inherits revert, Stripe untouched")}`,
	async () => {
		const customerId = "upd-revert-trial-extend-inherit";
		const {
			autumnV2_3,
			ctx,
			advancedTo,
			pro,
			enterprise,
			trialCustomerProduct,
			subscriptionBefore,
		} = await setupRevertTrial({ customerId });

		await extendRevertTrial({
			autumn: autumnV2_3,
			customerId,
			subscriptionId: trialCustomerProduct.id,
		});

		await expectRevertTrialAfterUpdate({
			ctx,
			customerId,
			trialProductId: enterprise.id,
			pausedProductId: pro.id,
			subscriptionBefore,
			expectedTrialEndsAt: advancedTo + ms.days(EXTENDED_TRIAL_DAYS),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update-revert-trial-stripe 3: change quantity on revert trial — trial kept, Stripe untouched")}`,
	async () => {
		const customerId = "upd-revert-trial-quantity";
		const {
			autumnV2_3,
			ctx,
			advancedTo,
			pro,
			enterprise,
			trialCustomerProduct,
			subscriptionBefore,
		} = await setupRevertTrial({ customerId });

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			subscription_id: trialCustomerProduct.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 300 }],
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
