/**
 * A plan whose credits feed a pooled balance stays with the source: pooled rows are
 * owned by the customer, so the transfer skips it instead of splitting the pool.
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import chalk from "chalk";
import {
	findActiveCusProduct,
	listActiveRcCusProducts,
	newRcClient,
	purchaseOnA,
	setupCustomers,
} from "./utils/revenue-cat-transfer-test-utils";
import { expectWebhookSuccess } from "./utils/revenue-cat-webhook-client";

test.concurrent(
	`${chalk.yellowBright("rc transfer: a plan with pooled credits is skipped and stays on the source")}`,
	async () => {
		const customerA = "rc-xfer-pool";
		const customerB = `${customerA}-b`;
		const pooledPlan = products.base({
			id: "rc-xfer-pool-pro",
			items: [
				{ ...items.monthlyMessages({ includedUsage: 500 }), pooled: true },
				items.monthlyPrice({ price: 10 }),
			],
		});
		await setupCustomers({ customerId: customerA, plans: [pooledPlan] });
		const { cusProduct, mock } = await purchaseOnA({
			plan: pooledPlan,
			rcStoreId: "com.app.rc_xfer_pool",
			rcInternalId: "prod_rc_xfer_pool",
			subId: "sub_rc_xfer_pool",
			customerId: customerA,
		});

		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: [customerA],
				transferredTo: [customerB],
				mock,
			}),
		);

		const stillOnA = await findActiveCusProduct({
			customerId: customerA,
			autumnProductId: pooledPlan.id,
		});
		expect(stillOnA?.id).toBe(cusProduct.id);
		expect(await listActiveRcCusProducts({ customerId: customerB })).toEqual(
			[],
		);
	},
);
