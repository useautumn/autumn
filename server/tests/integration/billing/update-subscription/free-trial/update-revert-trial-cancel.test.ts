/**
 * Extending a revert trial via billing.update must keep on_trial_end and the
 * previous plan link, so cancelling it afterwards still restores the paused plan.
 *
 * Red (before):  the replacement customer product lost on_trial_end, so cancel left
 *                the previous plan Paused and created the default product instead.
 * Green (after): cancel restores the previous plan and creates no default product.
 */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import chalk from "chalk";
import {
	expectRevertTrialCancelled,
	extendRevertTrial,
	setupRevertTrial,
} from "./utils/revertTrialUtils";

test.concurrent(
	`${chalk.yellowBright("update-revert-trial-cancel 1: extend revert trial then cancel immediately — previous plan restored")}`,
	async () => {
		const customerId = "update-revert-trial-cancel-basic";
		const { autumnV2_3, ctx, pro, enterprise, trialCustomerProduct } =
			await setupRevertTrial({ customerId });

		await extendRevertTrial({
			autumn: autumnV2_3,
			customerId,
			subscriptionId: trialCustomerProduct.id,
			onEnd: "revert",
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: enterprise.id,
			cancel_action: "cancel_immediately",
		});

		await expectRevertTrialCancelled({
			ctx,
			customerId,
			trialProductId: enterprise.id,
			pausedProductId: pro.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update-revert-trial-cancel 2: extend revert trial then cancel — default product NOT created")}`,
	async () => {
		const customerId = "update-revert-trial-cancel-no-default";
		const free = products.base({
			id: "free",
			isDefault: true,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx, pro, enterprise, trialCustomerProduct } =
			await setupRevertTrial({ customerId, extraProducts: [free] });

		await extendRevertTrial({
			autumn: autumnV2_3,
			customerId,
			subscriptionId: trialCustomerProduct.id,
			onEnd: "revert",
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: enterprise.id,
			cancel_action: "cancel_immediately",
		});

		const fullCustomer = await expectRevertTrialCancelled({
			ctx,
			customerId,
			trialProductId: enterprise.id,
			pausedProductId: pro.id,
		});
		const hasActiveDefault = fullCustomer.customer_products.some(
			(customerProduct) =>
				customerProduct.product_id === free.id &&
				customerProduct.status === CusProductStatus.Active,
		);
		expect(hasActiveDefault).toBe(false);
	},
);
