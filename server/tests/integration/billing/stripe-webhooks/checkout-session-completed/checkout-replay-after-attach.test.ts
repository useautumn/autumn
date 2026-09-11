/**
 * TDD test: a redelivered checkout.session.completed must not downgrade a
 * plan the customer attached after the checkout was already materialized.
 *
 * Stripe retries a sync-acked webhook that 500s. The first delivery promoted
 * the pending row and rewrote the Stripe subscription before crashing, so the
 * retry sees no pending rows but still holds the stale checkout plan.
 *
 * Red-failure mode (current behavior):
 *  - the retry rewrites the Stripe subscription back to the checkout plan
 *    (premium item deleted, pro item re-added), then throws on the duplicate
 *    customer_products insert, so Stripe keeps retrying.
 *
 * Green-success criteria (after fix):
 *  - the retry leaves the Stripe subscription on premium and completes
 *    without throwing.
 */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type ApiCustomerV3,
	CusProductStatus,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { handleStripeCheckoutSessionCompleted } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/handleStripeCheckoutSessionCompleted";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

test.concurrent(
	`${chalk.yellowBright("checkout replay: redelivered checkout.session.completed keeps a later attach")}`,
	async () => {
		const customerId = `checkout-replay-after-attach-${Date.now()}`;
		const pro = products.pro({
			id: "pro-replay",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium-replay",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { ctx, autumnV1, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});
		const internalCustomerId = customer?.internal_id ?? "";

		// 1. Checkout pro; snapshot the deferred metadata before the webhook deletes it.
		const checkout = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
		expect(checkout.payment_url).toContain("checkout.stripe.com");

		const pendingCustomerProduct = (
			await CusProductService.list({
				db: ctx.db,
				internalCustomerId,
				inStatuses: ALL_STATUSES,
			})
		).find((customerProduct) => customerProduct.product.id === pro.id);
		expect(pendingCustomerProduct?.status).toBe(CusProductStatus.Pending);

		const deferredMetadata = await MetadataService.get({
			db: ctx.db,
			id: pendingCustomerProduct?.metadata_id ?? "",
		});
		expect(deferredMetadata?.stripe_checkout_session_id).toBeTruthy();

		await completeStripeCheckoutForm({ url: checkout.payment_url });
		await timeout(12000);

		await expectCustomerProducts({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			active: [pro.id],
		});

		// 2. Upgrade to premium now that checkout saved a payment method.
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
		});
		await expectCustomerProducts({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			active: [premium.id],
			notPresent: [pro.id],
		});

		// 3. Replay the checkout webhook as Stripe would after a reverted claim.
		await MetadataService.insert({ db: ctx.db, data: deferredMetadata! });

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeEvent = {
			id: `evt_replay_${Date.now()}`,
			type: "checkout.session.completed",
			data: { object: { id: deferredMetadata!.stripe_checkout_session_id } },
		} as unknown as Stripe.CheckoutSessionCompletedEvent;

		let replayError: unknown;
		try {
			await handleStripeCheckoutSessionCompleted({
				ctx: { ...ctx, stripeEvent, fullCustomer },
				event: stripeEvent,
			});
		} catch (error) {
			replayError = error;
		}

		// 4. Stripe must still bill premium ($50), not the stale pro ($20).
		const stripeSubscriptions = await ctx.stripeCli.subscriptions.list({
			customer: customer?.processor?.id ?? "",
			limit: 100,
		});
		const unitAmounts = stripeSubscriptions.data.flatMap((subscription) =>
			subscription.items.data.map((item) => item.price.unit_amount),
		);
		expect(unitAmounts).toContain(5000);
		expect(unitAmounts).not.toContain(2000);

		await expectCustomerProducts({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			active: [premium.id],
			notPresent: [pro.id],
		});

		expect(replayError).toBeUndefined();
	},
);
