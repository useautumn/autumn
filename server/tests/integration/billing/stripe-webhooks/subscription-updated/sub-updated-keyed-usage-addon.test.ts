/**
 * TDD test for keyed-usage-price add-on lifecycle via subscription.updated
 * auto-sync (the "Automations (Overage)" shape — see the sibling
 * sub-created-keyed-usage-addon.test.ts for the subscription.created case
 * and full contract background).
 *
 * Contract under test:
 *   - item added to an existing subscription that already has a base plan ->
 *     the add-on auto-syncs active, base plan untouched.
 *   - item removed from a subscription that has both the base plan and the
 *     add-on active -> the add-on expires, base plan untouched.
 *   - multiple subscriptions, each with its own base plan in a different
 *     group, item added to only ONE -> add-on links to exactly that
 *     subscription; the other subscription's linked products are untouched;
 *     exactly one add-on instance total.
 *   - coexistence with an unrelated prepaid add-on (Dedicated IPs) already
 *     active on the same subscription -> both add-ons end up correctly and
 *     independently active, no cross-contamination.
 */

import { expect, test } from "bun:test";
import {
	automationsStripeProductId,
	createNativeAutomationsPrice,
	createNativeDedicatedIpPrice,
	dedicatedIpsStripeProductId,
	setupKeyedUsageAddonScenario,
} from "@tests/integration/billing/stripe-webhooks/utils/keyedUsageAddonTestUtils";
import {
	createExternalStripeSubscription,
	expectActiveLinkedCustomerProducts,
	getFullProductFromMap,
	requireBasePrice,
	stripePriceIdForPrice,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 1: item added to an existing base-plan-only subscription
// ═══════════════════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("sub.updated keyed-usage add-on: item added to base-plan-only subscription")}`,
	async () => {
		const customerId = "sub-updated-keyed-usage-1";
		const baseId = "keyed-usage-upd-1-base";
		const variantId = "keyed-usage-upd-1-variant";
		const automationsId = "keyed-usage-upd-1-automations";

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

		const subscription = await createExternalStripeSubscription({
			ctx,
			customerId,
			items: [{ price: stripePriceIdForPrice({ price: variantBasePrice }) }],
		});
		await waitForCustomerProducts({
			autumnV1,
			customerId,
			active: [variantId],
			notPresent: [automationsId],
		});

		const stripeProductId = await automationsStripeProductId({
			ctx,
			productId: automationsId,
		});
		const nativeAutomationsPrice = await createNativeAutomationsPrice({
			ctx,
			addonStripeProductId: stripeProductId,
		});
		await ctx.stripeCli.subscriptions.update(subscription.id, {
			items: [{ price: nativeAutomationsPrice.id }],
			proration_behavior: "none",
		});

		// ── Contract: add-on auto-syncs active, base plan untouched ──
		await waitForCustomerProducts({
			autumnV1,
			customerId,
			active: [variantId, automationsId],
		});
		await expectActiveLinkedCustomerProducts({
			ctx,
			stripeSubscriptionId: subscription.id,
			productIds: [variantId, automationsId],
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 2: item removed expires the add-on, base plan untouched
// ═══════════════════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("sub.updated keyed-usage add-on: item removal expires the add-on")}`,
	async () => {
		const customerId = "sub-updated-keyed-usage-2";
		const baseId = "keyed-usage-upd-2-base";
		const variantId = "keyed-usage-upd-2-variant";
		const automationsId = "keyed-usage-upd-2-automations";

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
		await waitForCustomerProducts({
			autumnV1,
			customerId,
			active: [variantId, automationsId],
		});

		const automationsItem = subscription.items.data.find(
			(item) => item.price.id === nativeAutomationsPrice.id,
		);
		if (!automationsItem) throw new Error("Automations subscription item not found");

		await ctx.stripeCli.subscriptions.update(subscription.id, {
			items: [{ id: automationsItem.id, deleted: true }],
			proration_behavior: "none",
		});

		// ── Contract: add-on expires, base plan untouched ──
		await waitForCustomerProducts({
			autumnV1,
			customerId,
			active: [variantId],
			notPresent: [automationsId],
		});
		await expectActiveLinkedCustomerProducts({
			ctx,
			stripeSubscriptionId: subscription.id,
			productIds: [variantId],
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 3: multiple subscriptions, item added to only one
// ═══════════════════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("sub.updated keyed-usage add-on: added to only one of two subscriptions")}`,
	async () => {
		const customerId = "sub-updated-keyed-usage-3";
		const baseId = "keyed-usage-upd-3-base";
		const variantId = "keyed-usage-upd-3-variant";
		const secondGroupBaseId = "keyed-usage-upd-3-storage-base";
		const automationsId = "keyed-usage-upd-3-automations";

		const { autumnV1, ctx, fullProducts } = await setupKeyedUsageAddonScenario({
			customerId,
			baseId,
			variantId,
			secondGroupBaseId,
			automationsId,
		});
		const variantFull = getFullProductFromMap({
			fullProducts,
			productId: variantId,
		});
		const variantBasePrice = requireBasePrice({ fullProduct: variantFull });
		const secondBaseFull = getFullProductFromMap({
			fullProducts,
			productId: secondGroupBaseId,
		});
		const secondBasePrice = requireBasePrice({ fullProduct: secondBaseFull });

		const subscriptionA = await createExternalStripeSubscription({
			ctx,
			customerId,
			items: [{ price: stripePriceIdForPrice({ price: variantBasePrice }) }],
		});
		const subscriptionB = await createExternalStripeSubscription({
			ctx,
			customerId,
			items: [{ price: stripePriceIdForPrice({ price: secondBasePrice }) }],
		});
		await waitForCustomerProducts({
			autumnV1,
			customerId,
			active: [variantId, secondGroupBaseId],
			notPresent: [automationsId],
		});

		const stripeProductId = await automationsStripeProductId({
			ctx,
			productId: automationsId,
		});
		const nativeAutomationsPrice = await createNativeAutomationsPrice({
			ctx,
			addonStripeProductId: stripeProductId,
		});
		await ctx.stripeCli.subscriptions.update(subscriptionA.id, {
			items: [{ price: nativeAutomationsPrice.id }],
			proration_behavior: "none",
		});

		// ── Contract: add-on links to subscription A only ──
		await waitForCustomerProducts({
			autumnV1,
			customerId,
			active: [variantId, secondGroupBaseId, automationsId],
		});
		await expectActiveLinkedCustomerProducts({
			ctx,
			stripeSubscriptionId: subscriptionA.id,
			productIds: [variantId, automationsId],
		});
		// ── Contract: subscription B is completely untouched ──
		await expectActiveLinkedCustomerProducts({
			ctx,
			stripeSubscriptionId: subscriptionB.id,
			productIds: [secondGroupBaseId],
		});

		// ── Contract: exactly one Automations instance total ──
		const fullCustomer = await CusService.getFull({ ctx, idOrInternalId: customerId });
		expect(
			fullCustomer.customer_products.filter(
				(cp) => cp.product_id === automationsId,
			).length,
		).toBe(1);
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 4: coexistence with an unrelated prepaid add-on (Dedicated IPs)
// ═══════════════════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("sub.updated keyed-usage add-on: coexists with an unrelated prepaid add-on")}`,
	async () => {
		const customerId = "sub-updated-keyed-usage-4";
		const baseId = "keyed-usage-upd-4-base";
		const variantId = "keyed-usage-upd-4-variant";
		const automationsId = "keyed-usage-upd-4-automations";
		const dedicatedIpsId = "keyed-usage-upd-4-dedicated-ips";

		const { autumnV1, ctx, fullProducts } = await setupKeyedUsageAddonScenario({
			customerId,
			baseId,
			variantId,
			automationsId,
			dedicatedIpsId,
		});
		const variantFull = getFullProductFromMap({
			fullProducts,
			productId: variantId,
		});
		const variantBasePrice = requireBasePrice({ fullProduct: variantFull });

		const dedicatedIpsProductId = await dedicatedIpsStripeProductId({
			ctx,
			productId: dedicatedIpsId,
		});
		const nativeDedicatedIpPrice = await createNativeDedicatedIpPrice({
			ctx,
			addonStripeProductId: dedicatedIpsProductId,
		});

		const subscription = await createExternalStripeSubscription({
			ctx,
			customerId,
			items: [
				{ price: stripePriceIdForPrice({ price: variantBasePrice }) },
				{ price: nativeDedicatedIpPrice.id, quantity: 2 },
			],
		});
		await waitForCustomerProducts({
			autumnV1,
			customerId,
			active: [variantId, dedicatedIpsId],
			notPresent: [automationsId],
		});
		const dedicatedIpsLinkedBefore = await expectActiveLinkedCustomerProducts({
			ctx,
			stripeSubscriptionId: subscription.id,
			productIds: [variantId, dedicatedIpsId],
		});
		const dedicatedIpsOptionsBefore = dedicatedIpsLinkedBefore
			.find((cp) => cp.product_id === dedicatedIpsId)
			?.options?.find((option) => option.feature_id != null)?.quantity;

		const automationsProductId = await automationsStripeProductId({
			ctx,
			productId: automationsId,
		});
		const nativeAutomationsPrice = await createNativeAutomationsPrice({
			ctx,
			addonStripeProductId: automationsProductId,
		});
		await ctx.stripeCli.subscriptions.update(subscription.id, {
			items: [{ price: nativeAutomationsPrice.id }],
			proration_behavior: "none",
		});

		// ── Contract: both add-ons independently active, no cross-contamination ──
		await waitForCustomerProducts({
			autumnV1,
			customerId,
			active: [variantId, dedicatedIpsId, automationsId],
		});
		const linkedAfter = await expectActiveLinkedCustomerProducts({
			ctx,
			stripeSubscriptionId: subscription.id,
			productIds: [variantId, dedicatedIpsId, automationsId],
		});
		const dedicatedIpsOptionsAfter = linkedAfter
			.find((cp) => cp.product_id === dedicatedIpsId)
			?.options?.find((option) => option.feature_id != null)?.quantity;
		expect(dedicatedIpsOptionsAfter).toBe(dedicatedIpsOptionsBefore);
	},
);
