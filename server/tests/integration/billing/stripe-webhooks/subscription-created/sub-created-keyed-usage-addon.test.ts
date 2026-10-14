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
import { WEBHOOK_TEST_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
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

		await waitForCustomerProducts({
			autumnV1,
			customerId,
			active: [variantId, automationsId],
			stripeCli: ctx.stripeCli,
			env: ctx.env,
			subscriptionId: subscription.id,
			eventTypes: ["customer.subscription.created"],
		});

		const linked = await expectActiveLinkedCustomerProducts({
			ctx,
			stripeSubscriptionId: subscription.id,
			productIds: [variantId, automationsId],
		});
		expect(linked).toHaveLength(2);
	},
	{ timeout: WEBHOOK_TEST_TIMEOUT_MS },
);
