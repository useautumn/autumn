/**
 * TDD test for: attaching a one-off add-on must not create a recurring Stripe
 * subscription that bundles items from a pre-existing customer product whose
 * subscription_ids have been cleared (orphaned).
 *
 * Repro of the May 4 incident on a Lingo-style customer (two duplicate
 * pay_as_you_go_prod attaches each created a brand-new sub bundling Production
 * base price + credits-prepaid one-off).
 *
 * Pre-fix: `buildStripeSubscriptionItemsUpdate` filters customer products by
 * empty `subscription_ids` when no current sub is targeted. That bucket
 * contains the orphaned base product (had a sub, link got cleared on a prior
 * billing.update bug), so its recurring price leaks into the new sub created
 * for the add-on attach. The customer ends up with a fresh recurring
 * subscription bundling base + credits-prepaid items.
 *
 * Post-fix: only products *being inserted* by this attach should contribute
 * recurring items to a brand-new sub. Pre-existing orphaned products must not
 * be re-bundled. A one-off add-on attach against an orphaned base produces a
 * one-off invoice only — no recurring sub is created for the add-on.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { CusService } from "@/internal/customers/CusService";

test(`${chalk.yellowBright("attach addon with orphaned base: one-off add-on does not create a new recurring sub")}`, async () => {
	const customerId = "attach-addon-orphaned-base";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const oneOffCreditsItem = items.oneOffMessages({
		billingUnits: 50,
		price: 10,
	});
	const credits = products.oneOffAddOn({
		id: "credits-pack",
		items: [oneOffCreditsItem],
	});

	const { customerId: cid, autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, credits] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Snapshot stripe state right after the base attach
	const fullCustomerBefore = await CusService.getFull({
		ctx,
		idOrInternalId: cid,
	});
	const proCusProduct = fullCustomerBefore.customer_products.find(
		(cp) => cp.product_id === pro.id,
	);
	expect(proCusProduct).toBeDefined();
	expect(proCusProduct!.subscription_ids?.length ?? 0).toBeGreaterThan(0);

	const stripeCustomerId = fullCustomerBefore.processor?.id;
	if (!stripeCustomerId) throw new Error("missing stripe customer id");

	const subsBefore = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
	});
	expect(subsBefore.data.length).toBe(1);
	const originalProSubId = subsBefore.data[0].id;

	// Simulate the Apr 29 orphan: clear the sub link on the pro cusProduct.
	// The Stripe sub still exists and is still active.
	await CusProductService.update({
		ctx,
		cusProductId: proCusProduct!.id,
		updates: { subscription_ids: [] },
	});

	// Now attach the one-off add-on. Pre-fix this incorrectly creates a fresh
	// recurring sub bundling pro's base price + credits prepaid item.
	await autumnV1.billing.attach({
		customer_id: cid,
		product_id: credits.id,
		feature_quantities: [
			{
				feature_id: oneOffCreditsItem.feature_id,
				quantity: oneOffCreditsItem.billing_units,
			},
		],
	});

	const subsAfter = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
	});

	// The only Stripe sub should still be the original (orphaned) Pro sub —
	// no extra sub created for the one-off add-on attach.
	expect(subsAfter.data.length).toBe(1);
	expect(subsAfter.data[0].id).toBe(originalProSubId);
});
