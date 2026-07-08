/** TDD contract: subscription-updated auto-sync must scope variant/add-on changes.
 * Adding a second plan group must keep both variants active. */

import { test } from "bun:test";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import {
	addVariantBaseItemToSubscription,
	createCustomBasePriceForProduct,
	createExternalStripeSubscription,
	createWrongUsagePrice,
	expectActiveLinkedCustomerProducts,
	expectStripeSubscriptionCreated,
	getFullProductFromMap,
	setupSharedStripeFamilies,
	trackCustomerUsage,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";

test(`${chalk.yellowBright("customer.subscription.updated auto-sync: adding another plan group keeps both variants")}`, async () => {
	const customerId = "sub-updated-shared-two-groups-add";
	const groupAVariantId = "shared_two_groups_add_a_var";
	const groupBVariantId = "shared_two_groups_add_b_var";
	const { autumnV1, ctx, fullProducts } = await setupSharedStripeFamilies({
		customerId,
		families: [
			{
				baseId: "shared_two_groups_add_a_base",
				group: "Shared Group A Add",
				baseAmount: 20,
				featureId: TestFeature.Messages,
				baseIncluded: 25_000,
				variants: [
					{ id: groupAVariantId, amount: 35, included: 150_000 },
				],
			},
			{
				baseId: "shared_two_groups_add_b_base",
				group: "Shared Group B Add",
				baseAmount: 10,
				featureId: TestFeature.Words,
				baseIncluded: 1_000,
				variants: [
					{ id: groupBVariantId, amount: 15, included: 5_000 },
				],
			},
		],
	});
	const groupAFull = getFullProductFromMap({
		fullProducts,
		productId: groupAVariantId,
	});
	const groupBFull = getFullProductFromMap({
		fullProducts,
		productId: groupBVariantId,
	});
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
		autumnV1,
		customerId,
		active: [groupAVariantId],
		notPresent: ["shared_two_groups_add_a_base", "shared_two_groups_add_b_base"],
	});
	await trackCustomerUsage({
		autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		value: 123,
	});

	await addVariantBaseItemToSubscription({
		ctx,
		subscription: createdSubscription,
		fullProduct: groupBFull,
		amount: 15,
	});

	const customer = await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [groupAVariantId, groupBVariantId],
		notPresent: ["shared_two_groups_add_a_base", "shared_two_groups_add_b_base"],
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
		featureId: TestFeature.Words,
		includedUsage: 5_000,
		balance: 5_000,
		usage: 0,
	});
	await expectActiveLinkedCustomerProducts({
		ctx,
		stripeSubscriptionId: createdSubscription.id,
		productIds: [groupAVariantId, groupBVariantId],
	});
});
