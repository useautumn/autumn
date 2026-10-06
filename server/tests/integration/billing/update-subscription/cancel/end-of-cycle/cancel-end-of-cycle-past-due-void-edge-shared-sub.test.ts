// Edge coverage for void-on-cancel of past_due customers: no unpaid-cycle credit, no shared-sub
// collateral void, void-correctness. Cases mutate shared org.config via withVoidFlag.

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";
import { expectNoCredit, withVoidFlag } from "./utils/pastDueVoidEdgeUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// #2 (shared-sub collateral): only void when the WHOLE subscription is cancelled
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("edge: shared sub - cancelling past_due main does NOT void surviving add-on's invoice")}`, async () => {
	const customerId = "qa-shared-sub-addon";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const addon = products.recurringAddOn({ id: "addon", items: [messagesItem] });

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({
				list: [free, pro, addon],
				customerIdsToDelete: [customerId],
			}),
		],
		// Add-on attaches onto the SAME Stripe subscription as pro (no new_billing_subscription).
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id }),
		],
	});

	await withVoidFlag({
		ctx,
		enabled: true,
		fn: async () => {
			const customerBefore =
				await autumnV1.customers.get<ApiCustomerV3>(customerId);
			const stripeCustomerId = customerBefore.stripe_id;
			// Precondition: a single shared Stripe subscription carrying both products' items.
			const subs = await ctx.stripeCli.subscriptions.list({
				customer: stripeCustomerId!,
			});
			expect(subs.data.length).toBe(1);
			expect(subs.data[0].items.data.length).toBeGreaterThanOrEqual(2);
			const subscriptionId = subs.data[0].id;

			// Force ONLY the main product past_due; the add-on stays on the live subscription.
			await driveProductPastDue({
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

			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			// Main gone; add-on survives -> the Stripe op was an "update", not a whole-sub cancel.
			await expectCustomerProducts({ customer, notPresent: [pro.id] });
			expect(customer.products.some((p) => p.id === addon.id)).toBe(true);

			const subsAfter = await ctx.stripeCli.subscriptions.list({
				customer: stripeCustomerId!,
			});
			expect(subsAfter.data.length).toBeGreaterThan(0);

			// The shared sub's open invoice must NOT be voided (it covers the surviving add-on).
			const invoices = await ctx.stripeCli.invoices.list({
				customer: stripeCustomerId!,
				subscription: subscriptionId,
			});
			expect(invoices.data.filter((inv) => inv.status === "void").length).toBe(
				0,
			);
			await expectNoCredit({ ctx, stripeCustomerId: stripeCustomerId! });
		},
	});
});
