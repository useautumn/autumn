/**
 * TDD contract: subscription.updated auto-sync must reflect prepaid add-on
 * quantity changes (the Resend dedicated_ip shape) with usage carry-over.
 *
 * Contract under test:
 *   New behaviors:
 *     - Stripe item quantity 1 -> 2 on the add-on's native prepaid price
 *       (quantity-only change MUST trigger auto-sync): feature total becomes
 *       2 and consumed usage carries over (usage 1 -> balance 1 of 2).
 *     - quantity 2 -> 1: feature total becomes 1, usage 1 carries
 *       (balance 0 of 1). Still exactly ONE add-on instance.
 *     - add-on item removed from the sub: add-on cusProduct expires; the
 *       main plan and its usage are untouched.
 *   Side effects:
 *     - subscription_ids linkage maintained; no duplicate add-on instances.
 *
 * Pre-impl red: quantity-only updates don't pass the priceOrProductChanged
 * gate (and incremental sync has no feature-quantity drift / removal
 * handling), so Autumn state never changes after the Stripe update.
 * Post-impl green: gate fires on quantity changes; incremental sync
 * re-syncs the add-on with expire_previous (carrying usage) and expires
 * removed add-ons.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { getBaseStripePriceId } from "@tests/integration/billing/sync/utils/syncProductHelpers";
import {
	createExternalStripeSubscription,
	expectActiveLinkedCustomerProducts,
	getFullProduct,
	trackCustomerUsage,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";

type AutumnV1 = Awaited<ReturnType<typeof initScenario>>["autumnV1"];

const waitForFeatureState = async ({
	autumnV1,
	customerId,
	featureId,
	includedUsage,
	balance,
	usage,
}: {
	autumnV1: AutumnV1;
	customerId: string;
	featureId: TestFeature;
	includedUsage: number;
	balance: number;
	usage: number;
}): Promise<ApiCustomerV3> => {
	const deadline = Date.now() + 60_000;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			expectCustomerFeatureCorrect({
				customer,
				featureId,
				includedUsage,
				balance,
				usage,
			});
			return customer;
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, 2_000));
		}
	}
	throw lastError;
};

const setupProWithPrepaidAddon = async ({
	customerId,
	proId,
	addonId,
	quantity,
}: {
	customerId: string;
	proId: string;
	addonId: string;
	quantity: number;
}) => {
	const pro = products.pro({
		id: proId,
		items: [items.monthlyUsers({ includedUsage: 5 })],
	});
	const addon = products.base({
		id: addonId,
		isAddOn: true,
		items: [items.prepaidMessages({ billingUnits: 1, price: 30 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [],
	});

	const proFull = await getFullProduct({ ctx, productId: pro.id });
	const addonFull = await getFullProduct({ ctx, productId: addon.id });
	const addonStripeProductId = addonFull.processor?.id;
	if (!addonStripeProductId) {
		throw new Error(`Add-on ${addon.id} has no mapped Stripe product`);
	}

	const nativePrice = await ctx.stripeCli.prices.create({
		product: addonStripeProductId,
		currency: "usd",
		unit_amount: 3000,
		recurring: { interval: "month" },
	});

	const subscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [
			{ price: getBaseStripePriceId({ fullProduct: proFull }) },
			{ price: nativePrice.id, quantity },
		],
	});

	await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [pro.id, addon.id],
	});

	const addonItem = subscription.items.data.find(
		(item) => item.price.id === nativePrice.id,
	);
	if (!addonItem) throw new Error("Add-on subscription item not found");

	return { autumnV1, pro, addon, subscription, addonItem };
};

const updateAddonItemQuantity = async ({
	subscription,
	addonItem,
	quantity,
}: {
	subscription: Stripe.Subscription;
	addonItem: Stripe.SubscriptionItem;
	quantity: number;
}) =>
	ctx.stripeCli.subscriptions.update(subscription.id, {
		items: [{ id: addonItem.id, quantity }],
		proration_behavior: "none",
	});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 1: quantity 1 -> 2 carries usage (0/1 used 1 -> 1/2)
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sub.updated prepaid add-on: qty 1 -> 2 carries usage")}`, async () => {
	const customerId = "sub-updated-prepaid-addon-1";
	const { autumnV1, pro, addon, subscription, addonItem } =
		await setupProWithPrepaidAddon({
			customerId,
			proId: "prepaid-upd-1-pro",
			addonId: "prepaid-upd-1-ip",
			quantity: 1,
		});

	await trackCustomerUsage({
		autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		value: 1,
	});

	await updateAddonItemQuantity({ subscription, addonItem, quantity: 2 });

	// ── Contract: total 2, usage 1 carried -> balance 1 ──
	await waitForFeatureState({
		autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		includedUsage: 2,
		balance: 1,
		usage: 1,
	});

	// ── Contract: still exactly one add-on instance on the sub ──
	await expectActiveLinkedCustomerProducts({
		ctx,
		stripeSubscriptionId: subscription.id,
		productIds: [pro.id, addon.id],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 2: quantity 2 -> 1 carries usage (1/2 used 1 -> 0/1)
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sub.updated prepaid add-on: qty 2 -> 1 carries usage")}`, async () => {
	const customerId = "sub-updated-prepaid-addon-2";
	const { autumnV1, pro, addon, subscription, addonItem } =
		await setupProWithPrepaidAddon({
			customerId,
			proId: "prepaid-upd-2-pro",
			addonId: "prepaid-upd-2-ip",
			quantity: 2,
		});

	await trackCustomerUsage({
		autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		value: 1,
	});

	await updateAddonItemQuantity({ subscription, addonItem, quantity: 1 });

	// ── Contract: total 1, usage 1 carried -> balance 0 ──
	await waitForFeatureState({
		autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		includedUsage: 1,
		balance: 0,
		usage: 1,
	});
	await expectActiveLinkedCustomerProducts({
		ctx,
		stripeSubscriptionId: subscription.id,
		productIds: [pro.id, addon.id],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 3: removing the add-on item expires the add-on, main plan untouched
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sub.updated prepaid add-on: item removal expires the add-on")}`, async () => {
	const customerId = "sub-updated-prepaid-addon-3";
	const { autumnV1, pro, addon, subscription, addonItem } =
		await setupProWithPrepaidAddon({
			customerId,
			proId: "prepaid-upd-3-pro",
			addonId: "prepaid-upd-3-ip",
			quantity: 1,
		});

	await trackCustomerUsage({
		autumnV1,
		customerId,
		featureId: TestFeature.Users,
		value: 2,
	});

	await ctx.stripeCli.subscriptions.update(subscription.id, {
		items: [{ id: addonItem.id, deleted: true }],
		proration_behavior: "none",
	});

	// ── Contract: add-on expired, main plan still active ──
	const customer = await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [pro.id],
		notPresent: [addon.id],
	});

	// ── Contract: main plan usage untouched (Users 2 of 5 used) ──
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: 3,
		usage: 2,
	});
	await expectActiveLinkedCustomerProducts({
		ctx,
		stripeSubscriptionId: subscription.id,
		productIds: [pro.id],
	});

	// ── Contract: only the add-on instance was expired ──
	expect(customer.products.some((p) => p.id === addon.id)).toBe(false);
});
