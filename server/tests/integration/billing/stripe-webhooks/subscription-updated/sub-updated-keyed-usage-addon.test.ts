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
import { WEBHOOK_TEST_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli";
import { CusService } from "@/internal/customers/CusService";

const waitProducts = ({
	autumnV1,
	ctx,
	customerId,
	subscriptionId,
	eventTypes,
	active,
	notPresent,
}: {
	autumnV1: AutumnInt;
	ctx: TestContext;
	customerId: string;
	subscriptionId: string;
	eventTypes: string[];
	active: string[];
	notPresent?: string[];
}) =>
	waitForCustomerProducts({
		autumnV1,
		customerId,
		active,
		notPresent,
		stripeCli: ctx.stripeCli,
		env: ctx.env,
		subscriptionId,
		eventTypes,
	});

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
		await waitProducts({
			autumnV1,
			ctx,
			customerId,
			subscriptionId: subscription.id,
			eventTypes: ["customer.subscription.created"],
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

		await waitProducts({
			autumnV1,
			ctx,
			customerId,
			subscriptionId: subscription.id,
			eventTypes: ["customer.subscription.updated"],
			active: [variantId, automationsId],
		});
		await expectActiveLinkedCustomerProducts({
			ctx,
			stripeSubscriptionId: subscription.id,
			productIds: [variantId, automationsId],
		});
	},
	{ timeout: WEBHOOK_TEST_TIMEOUT_MS },
);

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
		await waitProducts({
			autumnV1,
			ctx,
			customerId,
			subscriptionId: subscription.id,
			eventTypes: ["customer.subscription.created"],
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

		await waitProducts({
			autumnV1,
			ctx,
			customerId,
			subscriptionId: subscription.id,
			eventTypes: ["customer.subscription.updated"],
			active: [variantId],
			notPresent: [automationsId],
		});
		await expectActiveLinkedCustomerProducts({
			ctx,
			stripeSubscriptionId: subscription.id,
			productIds: [variantId],
		});
	},
	{ timeout: WEBHOOK_TEST_TIMEOUT_MS },
);

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
		await waitProducts({
			autumnV1,
			ctx,
			customerId,
			subscriptionId: subscriptionA.id,
			eventTypes: ["customer.subscription.created"],
			active: [variantId],
		});
		await waitProducts({
			autumnV1,
			ctx,
			customerId,
			subscriptionId: subscriptionB.id,
			eventTypes: ["customer.subscription.created"],
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

		await waitProducts({
			autumnV1,
			ctx,
			customerId,
			subscriptionId: subscriptionA.id,
			eventTypes: ["customer.subscription.updated"],
			active: [variantId, secondGroupBaseId, automationsId],
		});
		await expectActiveLinkedCustomerProducts({
			ctx,
			stripeSubscriptionId: subscriptionA.id,
			productIds: [variantId, automationsId],
		});
		await expectActiveLinkedCustomerProducts({
			ctx,
			stripeSubscriptionId: subscriptionB.id,
			productIds: [secondGroupBaseId],
		});

		const fullCustomer = await CusService.getFull({ ctx, idOrInternalId: customerId });
		expect(
			fullCustomer.customer_products.filter(
				(cp) => cp.product_id === automationsId,
			).length,
		).toBe(1);
	},
	{ timeout: WEBHOOK_TEST_TIMEOUT_MS },
);

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
		await waitProducts({
			autumnV1,
			ctx,
			customerId,
			subscriptionId: subscription.id,
			eventTypes: ["customer.subscription.created"],
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

		await waitProducts({
			autumnV1,
			ctx,
			customerId,
			subscriptionId: subscription.id,
			eventTypes: ["customer.subscription.updated"],
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
	{ timeout: WEBHOOK_TEST_TIMEOUT_MS },
);
