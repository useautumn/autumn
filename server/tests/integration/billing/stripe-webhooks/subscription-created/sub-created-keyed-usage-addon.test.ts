/**
 * TDD test for keyed-usage-price add-on auto-sync (the "Automations
 * (Overage)" shape): an add-on whose only Autumn price is a plain usage
 * price, matched to its Stripe item purely by config.stripe_product_id
 * (findKeyedPrice) — not by shape. The real Stripe price on the customer's
 * subscription has a totally different shape (graduated tiers with an
 * included allowance on Stripe's side) that Autumn deliberately never tries
 * to reproduce.
 *
 * Contract under test:
 *   - subscription.created with BOTH a matched base plan variant's item AND
 *     the native "Automations" keyed usage item present from the start ->
 *     both the base plan variant and the add-on sync active in one pass,
 *     linked to the same subscription.
 */

import { expect, test } from "bun:test";
import {
	automationsStripeProductId,
	createNativeAutomationsPrice,
	setupKeyedUsageAddonScenario,
} from "@tests/integration/billing/stripe-webhooks/utils/keyedUsageAddonTestUtils";
import {
	createExternalStripeSubscription,
	expectActiveLinkedCustomerProducts,
	expectStripeSubscriptionCreated,
	getFullProductFromMap,
	requireBasePrice,
	stripePriceIdForPrice,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import chalk from "chalk";

test(
	`${chalk.yellowBright("sub.created keyed-usage add-on: base variant + Automations overage item sync together")}`,
	async () => {
		const customerId = "sub-created-keyed-usage-1";
		const baseId = "keyed-usage-1-base";
		const variantId = "keyed-usage-1-variant";
		const automationsId = "keyed-usage-1-automations";

		const { autumnV1, ctx, fullProducts } = await setupKeyedUsageAddonScenario({
			customerId,
			baseId,
			variantId,
			automationsId,
		});

		const variantFull = getFullProductFromMap({
			fullProducts,
			productId: variantId,
		});
		const variantBasePrice = requireBasePrice({ fullProduct: variantFull });

		const stripeProductId = await automationsStripeProductId({
			ctx,
			productId: automationsId,
		});
		const nativeAutomationsPrice = await createNativeAutomationsPrice({
			ctx,
			addonStripeProductId: stripeProductId,
		});

		const subscription = await createExternalStripeSubscription({
			ctx,
			customerId,
			items: [
				{ price: stripePriceIdForPrice({ price: variantBasePrice }) },
				{ price: nativeAutomationsPrice.id },
			],
		});
		expectStripeSubscriptionCreated({ subscription });

		// ── Contract: both the matched base variant and the add-on sync active ──
		await waitForCustomerProducts({
			autumnV1,
			customerId,
			active: [variantId, automationsId],
		});

		// ── Contract: both are linked to this subscription ──
		const linked = await expectActiveLinkedCustomerProducts({
			ctx,
			stripeSubscriptionId: subscription.id,
			productIds: [variantId, automationsId],
		});
		expect(linked).toHaveLength(2);
	},
);
