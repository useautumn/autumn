/** TDD contract: subscription-updated auto-sync must scope variant/add-on changes.
 * Adding add-ons should link them without mutating existing variant usage. */

import { test } from "bun:test";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import {
	createCustomBasePriceForProduct,
	createExternalStripeSubscription,
	expectActiveLinkedCustomerProducts,
	expectStripeSubscriptionCreated,
	getFullProductFromMap,
	setupSharedStripeFamilies,
	updateBaseSubscriptionItemToVariant,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";

test(`${chalk.yellowBright("customer.subscription.updated auto-sync: base shape switch selects another variant")}`, async () => {
	const customerId = "sub-updated-shared-variant-switch";
	const variantAId = "shared_update_switch_var_a";
	const variantBId = "shared_update_switch_var_b";
	const { autumnV1, ctx, fullProducts } = await setupSharedStripeFamilies({
		customerId,
		families: [
			{
				baseId: "shared_update_switch_base",
				group: "Update Switch Group",
				baseAmount: 20,
				featureId: TestFeature.Messages,
				baseIncluded: 50_000,
				variants: [
					{ id: variantAId, amount: 35, included: 200_000 },
					{ id: variantBId, amount: 45, included: 300_000 },
				],
			},
		],
	});
	const variantAFull = getFullProductFromMap({
		fullProducts,
		productId: variantAId,
	});
	const variantBFull = getFullProductFromMap({
		fullProducts,
		productId: variantBId,
	});
	const variantAPrice = await createCustomBasePriceForProduct({
		ctx,
		fullProduct: variantAFull,
		amount: 35,
	});

	const createdSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: variantAPrice.id }],
	});
	expectStripeSubscriptionCreated({ subscription: createdSubscription });

	await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [variantAId],
		notPresent: ["shared_update_switch_base", variantBId],
	});
	await expectActiveLinkedCustomerProducts({
		ctx,
		stripeSubscriptionId: createdSubscription.id,
		productIds: [variantAId],
	});

	await updateBaseSubscriptionItemToVariant({
		ctx,
		subscription: createdSubscription,
		fromFullProduct: variantAFull,
		toFullProduct: variantBFull,
		toAmount: 45,
	});

	const customer = await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [variantBId],
		notPresent: ["shared_update_switch_base", variantAId],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 300_000,
		balance: 300_000,
		usage: 0,
	});
	await expectActiveLinkedCustomerProducts({
		ctx,
		stripeSubscriptionId: createdSubscription.id,
		productIds: [variantBId],
	});
});
