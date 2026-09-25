/**
 * Linked-plan preference for unclaimed items under a shared Stripe product.
 *
 * Scenario (the Resend marketing_pro_150k incident): sibling plans (no
 * base_variant_id) are all mapped to ONE Stripe product. The customer is on
 * the pricier sibling; someone edits the subscription item in Stripe to a
 * custom amount that shape-matches no catalog price.
 *
 * Contract under test:
 *   - detection keeps the plan already linked to the subscription (custom
 *     base at the new amount) instead of falling back to the first/cheapest
 *     sibling in catalog order.
 *   - incremental auto-sync sees no product change -> no plan swap.
 */

import { expect, test } from "bun:test";
import { ProcessorType } from "@autumn/shared";
import {
	createExternalStripeSubscription,
	expectStripeSubscriptionCreated,
	findSubscriptionItemByStripeProductId,
	getFullProduct,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import { expectSubscriptionMatchCorrect } from "@tests/integration/billing/utils/sync/expectSubscriptionMatch";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import testCtx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import { buildIncrementalSyncParams } from "@/internal/billing/v2/actions/sync/scope/buildIncrementalSyncParams.js";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";
import { createStripeFixedPriceUnderProduct } from "../utils/syncProductHelpers";

test(`${chalk.yellowBright("to-sync-params: custom price under a shared Stripe product keeps the linked sibling plan")}`, async () => {
	const customerId = "to-sync-params-linked-plan";
	const cheapId = "linked_plan_cheap";
	const linkedId = "linked_plan_expensive";
	const group = "Linked Plan Shared Product";

	const cheap = products.base({
		id: cheapId,
		group,
		items: [items.monthlyPrice({ price: 20 })],
	});
	const expensive = products.base({
		id: linkedId,
		group,
		items: [items.monthlyPrice({ price: 50 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		ctx: testCtx,
		setup: [
			s.deleteCustomer({ customerId }),
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [cheap, expensive], prefix: "" }),
		],
		actions: [],
	});

	// Both siblings share one Stripe product, like marketing_pro / _150k.
	const sharedStripeProduct = await ctx.stripeCli.products.create({
		name: `Linked Plan ${customerId}`,
	});
	for (const productId of [cheapId, linkedId]) {
		const fullProduct = await getFullProduct({ ctx, productId });
		await ProductService.updateByInternalId({
			db: ctx.db,
			internalId: fullProduct.internal_id,
			update: {
				processor: { type: ProcessorType.Stripe, id: sharedStripeProduct.id },
			},
		});
	}
	await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });

	// $50 shape-matches the expensive sibling -> auto-sync links it.
	const catalogPrice = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: sharedStripeProduct.id,
		unitAmount: 5000,
	});
	const subscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: catalogPrice.id }],
	});
	expectStripeSubscriptionCreated({ subscription });

	await waitForCustomerProducts({
		label: "initial-sync",
		autumnV1,
		customerId,
		active: [linkedId],
		notPresent: [cheapId],
		stripeCli: ctx.stripeCli,
		env: ctx.env,
		subscriptionId: subscription.id,
		eventTypes: ["customer.subscription.created"],
	});

	// Snapshot the linked state before the Stripe edit, so the sub.updated
	// webhook racing below can't change what detection is judged against.
	const { customer_products: customerProducts } = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const linkedCustomerProducts = customerProducts.filter((customerProduct) =>
		customerProduct.subscription_ids?.includes(subscription.id),
	);
	expect(linkedCustomerProducts.map((cp) => cp.product.id)).toEqual([linkedId]);

	// Edit the item in Stripe to $75 — matches neither $20 nor $50.
	const customPrice = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: sharedStripeProduct.id,
		unitAmount: 7500,
	});
	const item = findSubscriptionItemByStripeProductId({
		subscription,
		stripeProductId: sharedStripeProduct.id,
	});
	await ctx.stripeCli.subscriptionItems.update(item.id, {
		price: customPrice.id,
		proration_behavior: "none",
	});
	const updatedSubscription = await ctx.stripeCli.subscriptions.retrieve(
		subscription.id,
	);

	const { match, params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription: updatedSubscription,
		customerProducts,
	});

	// ── Contract: the linked sibling stays, carrying the custom amount ──
	expectSubscriptionMatchCorrect({
		match,
		currentPhase: {
			plans: [{ plan_id: linkedId, base_kind: "custom" }],
			noUnmatchedItems: true,
		},
	});
	const currentPhase = match.phaseMatches.find((phase) => phase.is_current);
	expect(currentPhase?.plans[0]?.customize?.price?.amount).toBe(75);

	// ── Contract: incremental auto-sync sees no product change -> no swap ──
	const incremental = buildIncrementalSyncParams({
		match,
		params,
		linkedCustomerProducts,
	});
	expect(incremental).toEqual({
		shouldSync: false,
		reason: "no_changed_targets",
	});
});
