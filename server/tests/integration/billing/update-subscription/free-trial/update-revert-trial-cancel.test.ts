import { expect, test } from "bun:test";
import {
	CusProductStatus,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import chalk from "chalk";
import {
	expectRevertTrialReverted,
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

		await expectRevertTrialReverted({
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

		const { fullCustomer } = await expectRevertTrialReverted({
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
