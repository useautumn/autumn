// tw:solo: withVoidFlag mutates the shared org.config, so this file can't share a worker.
// Void-correctness: an uncollectible invoice is voided like an open one.

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";
import { buildProductSet, withVoidFlag } from "./pastDueVoidEdgeUtils";

test(`${chalk.yellowBright("edge: uncollectible invoice is voided on the inline cancel path")}`, async () => {
	const customerId = "qa-uncollectible";
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
			const before = await ctx.stripeCli.invoices.list({
				customer: stripeCustomerId,
				subscription: subscriptionId,
			});
			const open = before.data.find((inv) => inv.status === "open");
			expect(open).toBeDefined();
			const uncollectible = await ctx.stripeCli.invoices.markUncollectible(
				open!.id,
			);
			expect(uncollectible.status).toBe("uncollectible");

			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
			});
			await timeout(3000);

			const after = await ctx.stripeCli.invoices.retrieve(uncollectible.id);
			expect(after.status).toBe("void");
			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			await expectCustomerProducts({
				customer,
				notPresent: [pro.id],
				active: [free.id],
			});
		},
	});
});
