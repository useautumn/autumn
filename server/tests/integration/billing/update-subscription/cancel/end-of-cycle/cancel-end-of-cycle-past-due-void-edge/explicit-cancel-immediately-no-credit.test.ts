// tw:solo: withVoidFlag mutates the shared org.config, so this file can't share a worker.
// A past_due cancel must never credit the unpaid cycle on an explicit cancel_immediately.

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	buildProductSet,
	expectInvoicesVoided,
	expectNoCredit,
	waitForPastDueCancelResolved,
	withVoidFlag,
} from "./pastDueVoidEdgeUtils";

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
				pollWebhookEffects: true,
			});
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_immediately",
			});
			await waitForPastDueCancelResolved({
				autumn: autumnV1,
				ctx,
				customerId,
				productId: pro.id,
				stripeCustomerId,
				subscriptionId,
			});

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
