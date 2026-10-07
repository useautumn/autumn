// Edge coverage for void-on-cancel of past_due customers: no unpaid-cycle credit, no shared-sub
// collateral void, void-correctness. Cases mutate shared org.config via withVoidFlag.

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";
import {
	buildProductSet,
	expectInvoicesVoided,
	expectNoCredit,
	withVoidFlag,
} from "./utils/pastDueVoidEdgeUtils";

test(`${chalk.yellowBright("edge: explicit cancel_immediately on past_due -> immediate, void, NO credit")}`, async () => {
	const customerId = "qa-explicit-immediate";
	const { free, pro } = buildProductSet();
	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await withVoidFlag({
		ctx,
		enabled: true,
		fn: async () => {
			const { subscriptionId, stripeCustomerId } = await driveProductPastDue({
				ctx,
				testClockId: testClockId!,
				customerId,
				productId: pro.id,
			});
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_immediately",
			});
			await timeout(3000);

			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			await expectCustomerProducts({
				customer,
				notPresent: [pro.id],
				active: [free.id],
			});
			await expectInvoicesVoided({ ctx, stripeCustomerId, subscriptionId });
			await expectNoCredit({ ctx, stripeCustomerId });
		},
	});
});
