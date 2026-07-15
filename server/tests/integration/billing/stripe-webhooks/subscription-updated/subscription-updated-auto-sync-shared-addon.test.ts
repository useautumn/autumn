/** TDD contract: subscription-updated auto-sync must scope variant/add-on changes.
 * Adding an add-on should link it without mutating existing variant usage. */

import { test } from "bun:test";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import chalk from "chalk";
import {
	createCustomBasePriceForProduct,
	createExternalStripeSubscription,
	createWrongUsagePrice,
	expectActiveLinkedCustomerProducts,
	expectStripeSubscriptionCreated,
	getFullProduct,
	getFullProductFromMap,
	requireBasePrice,
	setupSharedStripeFamilies,
	stripePriceIdForPrice,
	trackCustomerUsage,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";

test(`${chalk.yellowBright("customer.subscription.updated auto-sync: adding add-on keeps existing variant usage")}`, async () => {
	const customerId = "sub-updated-shared-addon-add";
	const groupAVariantId = "shared_addon_add_a_var";
	const addon = products.base({
		id: "shared_addon_add_plan",
		isAddOn: true,
		items: [
			items.monthlyPrice({ price: 30 }),
			items.monthlyUsers({ includedUsage: 7 }),
		],
	});
	const { autumnV1, ctx, fullProducts } = await setupSharedStripeFamilies({
		customerId,
		additionalProducts: [addon],
		families: [
			{
				baseId: "shared_addon_add_a_base",
				group: "Shared Addon Add Group A",
				baseAmount: 20,
				featureId: TestFeature.Messages,
				baseIncluded: 25_000,
				variants: [
					{ id: groupAVariantId, amount: 35, included: 150_000 },
				],
			},
		],
	});
	const groupAFull = getFullProductFromMap({
		fullProducts,
		productId: groupAVariantId,
	});
	const addonFull = await getFullProduct({ ctx, productId: addon.id });
	const groupAPrice = await createCustomBasePriceForProduct({
		ctx,
		fullProduct: groupAFull,
		amount: 35,
	});
	const wrongGroupAUsagePrice = await createWrongUsagePrice({
		ctx,
		fullProduct: groupAFull,
	});

	const createdSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [
			{ price: groupAPrice.id },
			{ price: wrongGroupAUsagePrice.id },
		],
	});
	expectStripeSubscriptionCreated({ subscription: createdSubscription });

	await waitForCustomerProducts({
		label: "initial-sync",
		autumnV1,
		customerId,
		active: [groupAVariantId],
		notPresent: ["shared_addon_add_a_base", addon.id],
	});
	await trackCustomerUsage({
		autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		value: 123,
	});

	const addonStripePriceId = stripePriceIdForPrice({
		price: requireBasePrice({ fullProduct: addonFull }),
	});
	await ctx.stripeCli.subscriptions.update(createdSubscription.id, {
		items: [{ price: addonStripePriceId }],
		proration_behavior: "none",
	});

	const customer = await waitForCustomerProducts({
		label: "after-add-addon",
		autumnV1,
		customerId,
		active: [groupAVariantId, addon.id],
		notPresent: ["shared_addon_add_a_base"],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 150_000,
		balance: 149_877,
		usage: 123,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 7,
		balance: 7,
		usage: 0,
	});
	await expectActiveLinkedCustomerProducts({
		ctx,
		stripeSubscriptionId: createdSubscription.id,
		productIds: [groupAVariantId, addon.id],
	});
});
