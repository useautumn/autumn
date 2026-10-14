import { test } from "bun:test";
import { ProcessorType } from "@autumn/shared";
import {
	createExternalStripeSubscription,
	expectActiveLinkedCustomerProducts,
	expectStripeSubscriptionCreated,
	findSubscriptionItemByStripeProductId,
	getFullProduct,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import { createStripeFixedPriceUnderProduct } from "@tests/integration/billing/sync/utils/syncProductHelpers";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import testCtx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import { ProductService } from "@/internal/products/ProductService";

test(`${chalk.yellowBright("customer.subscription.updated auto-sync: custom price on a shared Stripe product keeps the linked plan")}`, async () => {
	const customerId = "sub-updated-linked-plan-custom-price";
	const cheapId = "sub_updated_linked_cheap";
	const linkedId = "sub_updated_linked_expensive";
	const addOnId = "sub_updated_linked_addon";
	const group = "Sub Updated Linked Plan";

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
	const addOn = products.base({
		id: addOnId,
		isAddOn: true,
		items: [items.monthlyPrice({ price: 10 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		ctx: testCtx,
		setup: [
			s.deleteCustomer({ customerId }),
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [cheap, expensive, addOn], prefix: "" }),
		],
		actions: [],
	});

	const sharedStripeProduct = await ctx.stripeCli.products.create({
		name: `Linked Plan ${customerId}`,
	});
	const addOnStripeProduct = await ctx.stripeCli.products.create({
		name: `Linked Plan Add-on ${customerId}`,
	});
	const processors = [
		{ productId: cheapId, stripeProductId: sharedStripeProduct.id },
		{ productId: linkedId, stripeProductId: sharedStripeProduct.id },
		{ productId: addOnId, stripeProductId: addOnStripeProduct.id },
	];
	for (const { productId, stripeProductId } of processors) {
		const fullProduct = await getFullProduct({ ctx, productId });
		await ProductService.updateByInternalId({
			db: ctx.db,
			internalId: fullProduct.internal_id,
			update: {
				processor: { type: ProcessorType.Stripe, id: stripeProductId },
			},
		});
	}
	await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });

	const linkedPrice = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: sharedStripeProduct.id,
		unitAmount: 5000,
	});
	const subscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: linkedPrice.id }],
	});
	expectStripeSubscriptionCreated({ subscription });

	await waitForCustomerProducts({
		label: "initial-sync",
		autumnV1,
		customerId,
		active: [linkedId],
		notPresent: [cheapId, addOnId],
		stripeCli: ctx.stripeCli,
		env: ctx.env,
		subscriptionId: subscription.id,
		eventTypes: ["customer.subscription.created"],
	});

	const customPrice = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: sharedStripeProduct.id,
		unitAmount: 7500,
	});
	const addOnPrice = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: addOnStripeProduct.id,
		unitAmount: 1000,
	});
	const baseItem = findSubscriptionItemByStripeProductId({
		subscription,
		stripeProductId: sharedStripeProduct.id,
	});
	await ctx.stripeCli.subscriptions.update(subscription.id, {
		items: [
			{ id: baseItem.id, price: customPrice.id },
			{ price: addOnPrice.id },
		],
		proration_behavior: "none",
	});

	await waitForCustomerProducts({
		label: "after-custom-price",
		autumnV1,
		customerId,
		active: [addOnId],
		stripeCli: ctx.stripeCli,
		env: ctx.env,
		subscriptionId: subscription.id,
		eventTypes: ["customer.subscription.updated"],
	});
	await waitForCustomerProducts({
		label: "linked-plan-kept",
		autumnV1,
		customerId,
		active: [linkedId, addOnId],
		notPresent: [cheapId],
	});
	await expectActiveLinkedCustomerProducts({
		ctx,
		stripeSubscriptionId: subscription.id,
		productIds: [linkedId, addOnId],
	});
});
