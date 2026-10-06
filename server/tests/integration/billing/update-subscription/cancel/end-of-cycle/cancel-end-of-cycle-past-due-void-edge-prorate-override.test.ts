// Edge coverage for void-on-cancel of past_due customers: no unpaid-cycle credit, no shared-sub
// collateral void, void-correctness. Cases mutate shared org.config via withVoidFlag.

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";
import {
	buildProductSet,
	expectInvoicesVoided,
	expectNoCredit,
	withVoidFlag,
} from "./utils/pastDueVoidEdgeUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// #1 (no-credit): the proration suppression must hold across every entry point/input
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("edge: billing.update past_due + explicit proration_behavior=prorate_immediately -> immediate, void, NO credit")}`, async () => {
	const customerId = "qa-eoc-prorate-override";
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
			// Caller explicitly asks to prorate — the past_due resolution must still force "none".
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
				proration_behavior: "prorate_immediately",
			});
			await timeout(3000);

			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			await expectCustomerProducts({
				customer,
				notPresent: [pro.id],
				active: [free.id],
			});
			await expectNoStripeSubscription({
				db: ctx.db,
				customerId,
				org: ctx.org,
				env: ctx.env,
			});
			await expectInvoicesVoided({ ctx, stripeCustomerId, subscriptionId });
			await expectNoCredit({ ctx, stripeCustomerId });
		},
	});
});
