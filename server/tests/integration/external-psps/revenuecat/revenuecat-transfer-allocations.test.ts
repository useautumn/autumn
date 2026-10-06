/**
 * Moving a plan that feeds a shared credit pot re-fits the source's entity
 * allocations to what is left, without moving entities or allocations.
 */

import { test } from "bun:test";
import {
	allocateMessages,
	autumnV2_3,
} from "@tests/integration/balances/allocate/utils/allocateTestUtils";
import { expectMessagesBalance } from "@tests/integration/balances/allocate/utils/expectMessagesBalance";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import chalk from "chalk";
import {
	newRcClient,
	purchaseOnA,
	setupCustomers,
} from "./utils/revenue-cat-transfer-test-utils";
import { expectWebhookSuccess } from "./utils/revenue-cat-webhook-client";

test.concurrent(
	`${chalk.yellowBright("rc transfer: source entity allocations re-fit when the add-on leaves")}`,
	async () => {
		const customerA = "rc-xfer-alloc";
		const customerB = `${customerA}-b`;
		const base = products.base({
			id: "rc-xfer-alloc-base",
			items: [
				items.monthlyMessages({ includedUsage: 6000 }),
				items.monthlyPrice({ price: 10 }),
			],
		});
		const addOn = products.base({
			id: "rc-xfer-alloc-addon",
			isAddOn: true,
			items: [
				items.monthlyMessages({ includedUsage: 4000 }),
				items.monthlyPrice({ price: 5 }),
			],
		});
		const { entities } = await setupCustomers({
			customerId: customerA,
			plans: [base, addOn],
			entityCount: 2,
		});
		await purchaseOnA({
			plan: base,
			rcStoreId: "com.app.rc_xfer_alloc_base",
			rcInternalId: "prod_rc_xfer_alloc_base",
			subId: "sub_rc_xfer_alloc_base",
			customerId: customerA,
		});
		const { mock } = await purchaseOnA({
			plan: addOn,
			rcStoreId: "com.app.rc_xfer_alloc_addon",
			rcInternalId: "prod_rc_xfer_alloc_addon",
			subId: "sub_rc_xfer_alloc_addon",
			customerId: customerA,
		});
		const [first, second] = entities.map((entity) => entity.id);
		await allocateMessages({
			customerId: customerA,
			allocations: [
				{ entity_id: first, amount: 5000 },
				{ entity_id: second, amount: 5000 },
			],
		});

		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: [customerA],
				transferredTo: [customerB],
				mock,
			}),
		);

		for (const entityId of [first, second])
			await expectMessagesBalance({
				autumn: autumnV2_3,
				customerId: customerA,
				entityId,
				expected: { granted: 3000 },
			});
	},
);
