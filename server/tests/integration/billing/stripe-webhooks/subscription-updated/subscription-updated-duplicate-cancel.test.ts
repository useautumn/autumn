/**
 * TDD test: a duplicate cancel-at-period-end call must not clear the cancellation.
 *
 * When a subscription is already set to cancel at period end and another
 * `cancel_at_period_end: true` update comes in, Stripe bumps `canceled_at` and
 * fires `customer.subscription.updated` with previous_attributes containing only
 * `canceled_at` — while the subscription is still canceling.
 *
 * Red-failure mode (pre-fix):
 *  - isStripeSubscriptionRenewedEvent treated any change to `canceled_at` as an
 *    un-cancellation, so the duplicate cancel cleared the customer product's
 *    cancellation fields and deleted the scheduled default product.
 *
 * Green-success criteria (post-fix):
 *  - Pro stays canceling, the scheduled default product stays scheduled, and the
 *    Autumn subscription still shows canceled.
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";

test.concurrent(`${chalk.yellowBright("sub.updated: duplicate cancel via Stripe CLI keeps product canceling")}`, async () => {
	const customerId = "sub-updated-duplicate-cancel";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	// Cancel via Stripe CLI (simulating external cancellation)
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	await timeout(10000);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	// Duplicate cancel: re-sending cancel_at_period_end is a Stripe no-op, but
	// re-setting cancel_at to the same timestamp re-stamps canceled_at and fires
	// sub.updated with previous_attributes containing only canceled_at.
	const stripeSubscription =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at: stripeSubscription.cancel_at ?? undefined,
	});

	await timeout(10000);

	// Cancellation must survive the duplicate event
	const customerAfterDuplicate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterDuplicate,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterDuplicate,
		productId: free.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});
});
