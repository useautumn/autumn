/**
 * TRANSFER destination: every `transferred_to` id is tried before a customer is created,
 * so an existing customer mapped only by a later id still receives the purchase.
 */

import { expect, test } from "bun:test";
import { customers } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import { inArray } from "drizzle-orm";
import {
	listActiveRcCusProducts,
	newRcClient,
	purchaseOnA,
	rcPlan,
	setupCustomers,
} from "./utils/revenue-cat-transfer-test-utils";
import { expectWebhookSuccess } from "./utils/revenue-cat-webhook-client";

test.concurrent(
	`${chalk.yellowBright("rc transfer: destination found by a later transferred_to id, no customer created for earlier ones")}`,
	async () => {
		const customerA = "rc-xfer-ids";
		const customerB = `${customerA}-b`;
		const runSuffix = Date.now();
		const unknownIds = [
			`${customerA}-unknown1-${runSuffix}`,
			`${customerA}-unknown2-${runSuffix}`,
		];
		const plan = rcPlan({ id: "rc-xfer-ids-pro" });
		const { autumnV2_3 } = await setupCustomers({
			customerId: customerA,
			plans: [plan],
		});
		await autumnV2_3.customers.create({ id: customerB, name: customerB });
		const { cusProduct, mock } = await purchaseOnA({
			plan,
			rcStoreId: "com.app.rc_xfer_ids",
			rcInternalId: "prod_rc_xfer_ids",
			subId: "sub_rc_xfer_ids",
			customerId: customerA,
		});

		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: [customerA],
				transferredTo: [...unknownIds, customerB],
				mock,
			}),
		);

		const onB = await listActiveRcCusProducts({ customerId: customerB });
		expect(onB.map((cp) => cp.id)).toEqual([cusProduct.id]);
		const created = await ctx.db.query.customers.findMany({
			where: inArray(customers.id, unknownIds),
		});
		expect(created).toEqual([]);
	},
);
