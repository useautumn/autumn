/**
 * TRANSFER destination resolves through the `autumn_customer_id` subscriber attribute
 * before any RC id lookup, so the purchase lands on the declared customer and no
 * customer is created for the raw RC user id.
 */

import { expect, test } from "bun:test";
import { customers } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import {
	listActiveRcCusProducts,
	newRcClient,
	purchaseOnA,
	rcPlan,
	setupCustomers,
} from "./utils/revenue-cat-transfer-test-utils";
import { expectWebhookSuccess } from "./utils/revenue-cat-webhook-client";

test.concurrent(
	`${chalk.yellowBright("rc transfer: destination resolves via the autumn_customer_id override")}`,
	async () => {
		const customerA = "rc-xfer-ovr";
		const declaredCustomer = `${customerA}-b`;
		const rcDestinationUser = `${customerA}-rcuser-${Date.now()}`;
		const plan = rcPlan({ id: "rc-xfer-ovr-pro" });
		await setupCustomers({ customerId: customerA, plans: [plan] });
		const { cusProduct, mock } = await purchaseOnA({
			plan,
			rcStoreId: "com.app.rc_xfer_ovr",
			rcInternalId: "prod_rc_xfer_ovr",
			subId: "sub_rc_xfer_ovr",
			customerId: customerA,
		});

		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: [customerA],
				transferredTo: [rcDestinationUser],
				mock,
				subscriberAttributes: { autumn_customer_id: declaredCustomer },
			}),
		);

		const onDeclared = await listActiveRcCusProducts({
			customerId: declaredCustomer,
		});
		expect(onDeclared.map((cp) => cp.id)).toEqual([cusProduct.id]);
		const rawRcCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, rcDestinationUser),
		});
		expect(rawRcCustomer).toBeUndefined();
	},
);
