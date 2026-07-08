/** TDD contract: subscription-updated auto-sync must scope variant/add-on changes.
 * Switching a variant on one subscription must preserve the other subscription's group usage. */

import { test } from "bun:test";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import {
	createCustomBasePriceForProduct,
	createExternalStripeSubscription,
	createWrongUsagePrice,
	expectActiveLinkedCustomerProducts,
	expectStripeSubscriptionCreated,
	getFullProductFromMap,
	setupSharedStripeFamilies,
	trackCustomerUsage,
	updateBaseSubscriptionItemToVariant,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";

test(`${chalk.yellowBright("customer.subscription.updated auto-sync: separate subscription switch preserves other group usage")}`, async () => {
	const customerId = "sub-updated-shared-separate-switch";
	const groupAVariantId = "shared_separate_switch_a_var";
	const groupBVariantAId = "shared_separate_switch_b_var_a";
	const groupBVariantBId = "shared_separate_switch_b_var_b";
	const { autumnV1, ctx, fullProducts } = await setupSharedStripeFamilies({
		customerId,
		families: [
			{
				baseId: "shared_separate_switch_a_base",
				group: "Shared Separate Switch A",
				baseAmount: 20,
				featureId: TestFeature.Messages,
				baseIncluded: 25_000,
				variants: [
					{ id: groupAVariantId, amount: 35, included: 150_000 },
				],
			},
			{
				baseId: "shared_separate_switch_b_base",
				group: "Shared Separate Switch B",
				baseAmount: 10,
				featureId: TestFeature.Words,
				baseIncluded: 1_000,
				variants: [
					{ id: groupBVariantAId, amount: 15, included: 5_000 },
					{ id: groupBVariantBId, amount: 25, included: 10_000 },
				],
			},
		],
	});
	const groupAFull = getFullProductFromMap({
		fullProducts,
		productId: groupAVariantId,
	});
	const groupBVariantAFull = getFullProductFromMap({
		fullProducts,
		productId: groupBVariantAId,
	});
	const groupBVariantBFull = getFullProductFromMap({
		fullProducts,
		productId: groupBVariantBId,
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
	const groupBVariantAPrice = await createCustomBasePriceForProduct({
		ctx,
		fullProduct: groupBVariantAFull,
		amount: 15,
	});

	const groupASubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [
			{ price: groupAPrice.id },
			{ price: wrongGroupAUsagePrice.id },
		],
	});
	expectStripeSubscriptionCreated({ subscription: groupASubscription });

	const groupBSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: groupBVariantAPrice.id }],
	});
	expectStripeSubscriptionCreated({ subscription: groupBSubscription });

	await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [groupAVariantId, groupBVariantAId],
		notPresent: [
			"shared_separate_switch_a_base",
			"shared_separate_switch_b_base",
			groupBVariantBId,
		],
	});
	await trackCustomerUsage({
		autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		value: 123,
	});
	await trackCustomerUsage({
		autumnV1,
		customerId,
		featureId: TestFeature.Words,
		value: 321,
	});

	await updateBaseSubscriptionItemToVariant({
		ctx,
		subscription: groupBSubscription,
		fromFullProduct: groupBVariantAFull,
		toFullProduct: groupBVariantBFull,
		toAmount: 25,
	});

	const customer = await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [groupAVariantId, groupBVariantBId],
		notPresent: [
			"shared_separate_switch_a_base",
			"shared_separate_switch_b_base",
			groupBVariantAId,
		],
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
		includedUsage: 10_000,
	});
	await expectActiveLinkedCustomerProducts({
		ctx,
		stripeSubscriptionId: groupASubscription.id,
		productIds: [groupAVariantId],
	});
	await expectActiveLinkedCustomerProducts({
		ctx,
		stripeSubscriptionId: groupBSubscription.id,
		productIds: [groupBVariantBId],
	});
});
