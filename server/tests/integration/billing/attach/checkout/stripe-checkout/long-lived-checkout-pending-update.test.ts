/**
 * Editing a pending plan opened from a long-lived checkout link.
 *
 * Red (before): the edit re-attached the plan with a plain 24h Stripe checkout, so
 * billing.update returned a new Stripe URL and the original link reported the
 * checkout as completed.
 * Green (after): billing.update returns the same link, and opening it sells the
 * edited plan to the same customer with exactly one pending plan.
 */

import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	CusProductStatus,
	customers,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import {
	getLongLivedCheckoutId,
	getStripeSessionId,
	startLongLivedCheckout,
} from "./utils/longLivedCheckoutUtils";

test.concurrent(
	`${chalk.yellowBright("long-lived checkout pending update: editing the price keeps the link and sells the edited plan")}`,
	async () => {
		const customerId = `ll-pending-update-price-${Date.now()}`;
		const pro = products.pro({
			id: "pro-ll-pending-update-price",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
			actions: [],
		});

		const attachResult = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			long_lived_checkout: true,
			customize: { price: itemsV2.monthlyPrice({ amount: 1200 }) },
		});
		const checkoutId = getLongLivedCheckoutId(attachResult.payment_url);
		const firstSessionId = getStripeSessionId(
			await startLongLivedCheckout(checkoutId),
		);

		// 1. The edit returns the same link instead of a new Stripe URL.
		const updateResult =
			await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				customize: { price: itemsV2.monthlyPrice({ amount: 1000 }) },
			});
		expect(updateResult.payment_url).toBe(attachResult.payment_url);

		// 2. Opening the link sells the edited plan in a new Stripe session.
		const editedSessionId = getStripeSessionId(
			await startLongLivedCheckout(checkoutId),
		);
		expect(editedSessionId).not.toBe(firstSessionId);
		const editedSession =
			await ctx.stripeCli.checkout.sessions.retrieve(editedSessionId);
		expect(editedSession.amount_total).toBe(100_000);

		// 3. The customer still has exactly one pending plan.
		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		const pendingRows = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: dbCustomer!.internal_id,
			inStatuses: [CusProductStatus.Pending],
		});
		expect(pendingRows).toHaveLength(1);
	},
);
