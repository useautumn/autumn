/**
 * TDD test for: a customer product linked to a Stripe subscription that is
 * already `canceled` must stop 400-ing every billing call, without ever
 * turning into a duplicate subscription or a duplicate charge.
 *
 * Contract under test:
 *   New types/fields:
 *     - BillingContext.canceledStripeSubscriptionId?: string
 *     - fetchStripeSubscriptionForBilling -> { stripeSubscription, canceledStripeSubscriptionId }
 *   New behaviors:
 *     - updateSubscription (feature_quantities) on a canceled sub
 *         -> 200, no new Stripe sub, no new invoice, subscription_ids preserved,
 *            Autumn-side quantity still applied
 *     - updateSubscription cancel_immediately on a canceled sub
 *         -> 200, product expired, default activated, no new sub, no new invoice
 *     - updateSubscription cancel_end_of_cycle on a canceled sub
 *         -> 400 naming the canceled sub and cancel_immediately
 *     - updateSubscription uncancel on a canceled sub
 *         -> 400; resuming would leave the plan active and permanently unbilled
 *     - attach a different plan on a canceled sub
 *         -> 200, a NEW active Stripe sub, charged full price, no credit from the dead sub
 *   Side effects:
 *     - no additional Stripe subscription on the customer for update/cancel paths
 *     - no additional Autumn invoice row for update/cancel paths
 *
 * Pre-impl red: every case fails in `fetchStripeSubscriptionForBilling`, which
 * throws `Subscription <id> is canceled` (400).
 * Post-impl green: the fetch reports the canceled id instead of throwing. Each
 * action then decides what that means — updateSubscription turns it into
 * skipBillingChanges (which `evaluateStripeBillingPlan` already honours), while
 * attach abandons the dead sub and buys fresh.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	getSubscriptionIdsForProduct,
	linkCustomerProductToCanceledSubscription,
	listStripeSubscriptions,
} from "./utils/canceledSubscriptionUtils";

// ═══════════════════════════════════════════════════════════════════════════
// Behavior 2: update quantity on a canceled sub — no error, no charge, no sub
// ═══════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("canceled sub: update feature_quantities succeeds without a new sub or charge")}`, async () => {
	const customerId = "canceled-sub-update-qty";
	const billingUnits = 100;

	const prepaidItem = items.prepaidMessages({ billingUnits, price: 10 });
	const pro = products.pro({ id: "pro", items: [prepaidItem] });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: billingUnits }],
			}),
		],
	});

	const { subscriptionId, stripeCustomerId } =
		await linkCustomerProductToCanceledSubscription({
			ctx,
			customerId,
			productId: pro.id,
		});

	const subscriptionsBefore = await listStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});

	// ── Contract assertion 1: no longer throws `Subscription <id> is canceled` ──
	await autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: billingUnits * 2 },
		],
	});

	// ── Contract assertion 2: no replacement Stripe subscription ──────────────
	const subscriptionsAfter = await listStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});
	expect(subscriptionsAfter.map((sub) => sub.id).sort()).toEqual(
		subscriptionsBefore.map((sub) => sub.id).sort(),
	);
	expect(
		subscriptionsAfter.every((sub) => sub.status === "canceled"),
		"every stripe subscription should still be canceled",
	).toBe(true);

	// ── Contract assertion 3: no new invoice (attach invoice only) ────────────
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 1,
	});

	// ── Contract assertion 4: subscription link preserved ─────────────────────
	expect(
		await getSubscriptionIdsForProduct({ ctx, customerId, productId: pro.id }),
	).toEqual([subscriptionId]);

	// ── Contract assertion 5: the Autumn-side update still landed ─────────────
	await expectBalanceCorrect({
		customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
		featureId: TestFeature.Messages,
		remaining: billingUnits * 2,
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Behavior 3: cancel_immediately still works
// ═══════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("canceled sub: cancel_immediately expires the plan and activates the default")}`, async () => {
	const customerId = "canceled-sub-cancel-now";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const { stripeCustomerId } = await linkCustomerProductToCanceledSubscription({
		ctx,
		customerId,
		productId: pro.id,
	});

	const subscriptionsBefore = await listStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});

	// ── Contract assertion 1: cancel_immediately does not 400 ─────────────────
	await autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		cancel_action: "cancel_immediately",
	});

	// ── Contract assertion 2: pro gone, default active ────────────────────────
	await expectCustomerProducts({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		notPresent: [pro.id],
		active: [free.id],
	});

	// ── Contract assertion 3: no new sub, no new invoice ──────────────────────
	const subscriptionsAfter = await listStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});
	expect(subscriptionsAfter.length).toBe(subscriptionsBefore.length);

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 1,
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Behavior 4: cancel_end_of_cycle is blocked
// ═══════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("canceled sub: cancel_end_of_cycle is rejected with a remedy")}`, async () => {
	const customerId = "canceled-sub-cancel-eoc";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const { subscriptionId } = await linkCustomerProductToCanceledSubscription({
		ctx,
		customerId,
		productId: pro.id,
	});

	// ── Contract assertion 1: explicit 400 naming the sub and the remedy ──────
	await expectAutumnError({
		errMessage: subscriptionId,
		func: () =>
			autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
			}),
	});

	await expectAutumnError({
		errMessage: "cancel_immediately",
		func: () =>
			autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
			}),
	});

	// ── Contract assertion 2: state untouched by the rejected call ────────────
	await expectCustomerProducts({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		active: [pro.id],
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Behavior 4b: uncancel cannot resurrect a plan onto a dead subscription
// ═══════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("canceled sub: uncancel is rejected rather than reviving an unbilled plan")}`, async () => {
	const customerId = "canceled-sub-uncancel";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		// Cancel at end of cycle first: pro is canceling, so uncancel is meaningful.
		actions: [s.attach({ productId: pro.id }), s.cancel({ productId: pro.id })],
	});

	const { subscriptionId } = await linkCustomerProductToCanceledSubscription({
		ctx,
		customerId,
		productId: pro.id,
	});

	// ── Contract assertion 1: uncancel refuses, naming the dead sub ───────────
	await expectAutumnError({
		errMessage: subscriptionId,
		func: () =>
			autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "uncancel",
			}),
	});

	// ── Contract assertion 2: the plan is still canceling, not revived ────────
	await expectCustomerProducts({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		canceling: [pro.id],
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Behavior 5: attach is a fresh purchase, not a resurrection
// ═══════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("canceled sub: attaching another plan creates a fresh sub and charges full price")}`, async () => {
	const customerId = "canceled-sub-attach-fresh";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const { subscriptionId, stripeCustomerId } =
		await linkCustomerProductToCanceledSubscription({
			ctx,
			customerId,
			productId: pro.id,
		});

	// ── Contract assertion 1: attach does not 400 ─────────────────────────────
	await autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: premium.id,
	});

	// ── Contract assertion 2: exactly one NEW, non-canceled subscription ──────
	const subscriptionsAfter = await listStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});
	const liveSubscriptions = subscriptionsAfter.filter(
		(sub) => sub.status !== "canceled",
	);
	expect(liveSubscriptions.length).toBe(1);
	expect(liveSubscriptions[0].id).not.toBe(subscriptionId);

	// ── Contract assertion 3: full price, no credit from the dead sub ─────────
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 2,
		latestTotal: 50,
	});

	// ── Contract assertion 4: premium replaces pro ────────────────────────────
	await expectCustomerProducts({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		active: [premium.id],
		notPresent: [pro.id],
	});
});
