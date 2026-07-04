/** TDD contract: subscription-updated auto-sync must not treat a single
 * ungrouped (no product.group configured) base plan as "ambiguous". Most
 * catalogs never set product.group, so a customer with exactly one
 * non-add-on product linked to a subscription must still auto-sync a
 * Stripe-portal downgrade to another ungrouped plan with a custom price. */

import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import chalk from "chalk";
import {
	createCustomBasePriceForProduct,
	createExternalStripeSubscription,
	expectActiveLinkedCustomerProducts,
	expectStripeSubscriptionCreated,
	getFullProduct,
	updateBaseSubscriptionItemToVariant,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import testCtx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

test(`${chalk.yellowBright("customer.subscription.updated auto-sync: ungrouped base plan downgrade with custom price")}`, async () => {
	const customerId = "sub-updated-ungrouped-downgrade";
	const ultraId = "ungrouped_downgrade_ultra";
	const proId = "ungrouped_downgrade_pro";

	const ultra = products.base({
		id: ultraId,
		items: [items.monthlyPrice({ price: 30 })],
	});
	const pro = products.base({
		id: proId,
		items: [items.monthlyPrice({ price: 19 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		ctx: testCtx,
		setup: [
			s.deleteCustomer({ customerId }),
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [ultra, pro], prefix: "" }),
		],
		actions: [],
	});

	const ultraFull = await getFullProduct({ ctx, productId: ultraId });
	const proFull = await getFullProduct({ ctx, productId: proId });

	const ultraCustomPrice = await createCustomBasePriceForProduct({
		ctx,
		fullProduct: ultraFull,
		amount: 30,
	});

	const createdSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: ultraCustomPrice.id }],
	});
	expectStripeSubscriptionCreated({ subscription: createdSubscription });

	await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [ultraId],
		notPresent: [proId],
	});
	await expectActiveLinkedCustomerProducts({
		ctx,
		stripeSubscriptionId: createdSubscription.id,
		productIds: [ultraId],
	});

	await updateBaseSubscriptionItemToVariant({
		ctx,
		subscription: createdSubscription,
		fromFullProduct: ultraFull,
		toFullProduct: proFull,
		toAmount: 19,
	});

	await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [proId],
		notPresent: [ultraId],
	});
	await expectActiveLinkedCustomerProducts({
		ctx,
		stripeSubscriptionId: createdSubscription.id,
		productIds: [proId],
	});
});
