/** TDD contract: subscription-updated auto-sync must scope variant/add-on changes.
 * Switching one group's variant must preserve the other group's usage. */

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
	updateBaseSubscriptionItemToVariant,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";

test(`${chalk.yellowBright("customer.subscription.updated auto-sync: switching one group preserves the other group")}`, async () => {
	const customerId = "sub-updated-shared-two-groups-switch";
	const groupAVariantId = "shared_two_groups_switch_a_var";
	const groupBVariantAId = "shared_two_groups_switch_b_var_a";
	const groupBVariantBId = "shared_two_groups_switch_b_var_b";
	const { autumnV1, ctx, fullProducts } = await setupSharedStripeFamilies({
		customerId,
		families: [
			{
				baseId: "shared_two_groups_switch_a_base",
				group: "Shared Group A Switch",
				baseAmount: 20,
				featureId: TestFeature.Messages,
				baseIncluded: 25_000,
				variants: [
					{ id: groupAVariantId, amount: 35, included: 150_000 },
				],
			},
			{
				baseId: "shared_two_groups_switch_b_base",
				group: "Shared Group B Switch",
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
		notPresent: [
			"shared_two_groups_switch_a_base",
			"shared_two_groups_switch_b_base",
			groupBVariantAId,
			groupBVariantBId,
		],
	});

	const subscriptionWithTwoGroups = await addVariantBaseItemToSubscription({
		ctx,
		subscription: createdSubscription,
		fullProduct: groupBVariantAFull,
		amount: 15,
	});

	await waitForCustomerProducts({
		label: "after-add-group-b",
		autumnV1,
		customerId,
		active: [groupAVariantId, groupBVariantAId],
		notPresent: [
			"shared_two_groups_switch_a_base",
			"shared_two_groups_switch_b_base",
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
		subscription: subscriptionWithTwoGroups,
		fromFullProduct: groupBVariantAFull,
		toFullProduct: groupBVariantBFull,
		toAmount: 25,
	});

	const customer = await waitForCustomerProducts({
		label: "after-switch-group-b",
		autumnV1,
		customerId,
		active: [groupAVariantId, groupBVariantBId],
		notPresent: [
			"shared_two_groups_switch_a_base",
			"shared_two_groups_switch_b_base",
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
		stripeSubscriptionId: createdSubscription.id,
		productIds: [groupAVariantId, groupBVariantBId],
	});
});
