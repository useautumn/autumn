/** TDD contract: subscription-updated auto-sync must scope variant changes.
 * Updated Stripe subscriptions should sync only changed plan-group targets. */

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
