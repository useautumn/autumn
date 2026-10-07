// tw:solo: withVoidFlag mutates the shared org.config, so this file can't share a worker.
// Gating: an omitted cancel_action must not resolve to immediate or void.

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";
import { buildProductSet, withVoidFlag } from "./pastDueVoidEdgeUtils";

test(`${chalk.yellowBright("edge: omitted cancel_action on past_due does not resolve/void")}`, async () => {
	const customerId = "qa-no-cancel-action";
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
			// No cancel_action: nothing to cancel, no resolution, no void. recalculate_balances
			// is a no-op billing-relevant field so the request has something to act on.
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				recalculate_balances: { enabled: true },
			});
			await timeout(3000);

			// pro still present (not removed), open invoice still open, nothing voided.
			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			expect(customer.products.some((p) => p.id === pro.id)).toBe(true);
			const invoices = await ctx.stripeCli.invoices.list({
				customer: stripeCustomerId,
				subscription: subscriptionId,
			});
			expect(
				invoices.data.filter((inv) => inv.status === "open").length,
			).toBeGreaterThan(0);
			expect(invoices.data.filter((inv) => inv.status === "void").length).toBe(
				0,
			);
		},
	});
});
