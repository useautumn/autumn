/**
 * The legacy v1 `/attach` entry points build their Stripe context through
 * `attachParamsToStripeBillingContext`, whose result short-circuits
 * `setupStripeBillingContext`. If that adapter drops
 * `canceledStripeSubscriptionId`, every canceled-subscription guard silently
 * disarms on the v1 paths while still working on v2.
 *
 * Contract under test:
 *   New behaviors:
 *     - legacy v1 attach of a different plan on a canceled sub
 *         -> fresh purchase, same as v2 billing.attach
 *     - legacy v1 quantity update on a canceled sub
 *         -> quantity applies, NO charge, no replacement subscription
 *   Side effects:
 *     - no additional Autumn invoice row on the quantity path
 *
 * Pre-fix red: the adapter kept only `stripeSubscription`. Legacy attach then
 * rejected the plan as having no linked subscription, and legacy quantity
 * update — with skipBillingChanges never set — billed a dead subscription
 * through the manual-invoice path.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
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
// Legacy v1 attach — must behave like v2: abandon the dead sub, buy fresh
// ═══════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("canceled sub legacy: v1 attach of another plan creates a fresh sub")}`, async () => {
	const customerId = "canceled-sub-legacy-attach";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
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

	// ── Contract assertion 1: no "paid but no stripe subscription" rejection ──
	await autumnV1.attach({ customer_id: customerId, product_id: premium.id });

	// ── Contract assertion 2: exactly one NEW, non-canceled subscription ──────
	const liveSubscriptions = (
		await listStripeSubscriptions({ ctx, stripeCustomerId })
	).filter((sub) => sub.status !== "canceled");
	expect(liveSubscriptions.length).toBe(1);
	expect(liveSubscriptions[0].id).not.toBe(subscriptionId);

	// ── Contract assertion 3: premium replaces pro and is charged in full ────
	await expectCustomerProducts({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		active: [premium.id],
		notPresent: [pro.id],
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 2,
		latestTotal: 50,
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Legacy v1 quantity update — the path that actually billed a dead sub
// ═══════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("canceled sub legacy: v1 quantity update applies without charging")}`, async () => {
	const customerId = "canceled-sub-legacy-qty";
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

	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
			?.length ?? 0;
	const subscriptionsBefore = await listStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});

	// ── Contract assertion 1: the update goes through ─────────────────────────
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: billingUnits * 2 }],
	});

	// ── Contract assertion 2: NOT charged for the extra units ────────────────
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});

	// ── Contract assertion 3: no replacement subscription ────────────────────
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

	// ── Contract assertion 4: Autumn-side quantity applied, link preserved ───
	await expectBalanceCorrect({
		customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
		featureId: TestFeature.Messages,
		remaining: billingUnits * 2,
	});
	expect(
		await getSubscriptionIdsForProduct({ ctx, customerId, productId: pro.id }),
	).toEqual([subscriptionId]);
});
