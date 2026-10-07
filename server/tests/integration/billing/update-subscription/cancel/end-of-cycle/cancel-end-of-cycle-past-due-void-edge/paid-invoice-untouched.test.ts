// tw:solo: withVoidFlag mutates the shared org.config, so this file can't share a worker.
// Void-correctness: the paid invoice is untouched; only the open one is voided.

import { expect, test } from "bun:test";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";
import { buildProductSet, withVoidFlag } from "./pastDueVoidEdgeUtils";

test(`${chalk.yellowBright("edge: paid invoice untouched, only the open invoice voided")}`, async () => {
	const customerId = "qa-paid-untouched";
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
			// Initial attach invoice is paid (success card); driveProductPastDue then fails the renewal.
			const { subscriptionId, stripeCustomerId } = await driveProductPastDue({
				ctx,
				testClockId: testClockId!,
				customerId,
				productId: pro.id,
			});
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
			});
			await timeout(3000);

			const invoices = await ctx.stripeCli.invoices.list({
				customer: stripeCustomerId,
				subscription: subscriptionId,
			});
			expect(invoices.data.filter((inv) => inv.status === "paid").length).toBe(
				1,
			);
			expect(invoices.data.filter((inv) => inv.status === "open").length).toBe(
				0,
			);
			expect(invoices.data.filter((inv) => inv.status === "void").length).toBe(
				1,
			);
		},
	});
});
