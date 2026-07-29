/** TDD contract: subscription-created auto-sync must select exact variants.
 * The test must create a real external Stripe sub before sync assertions. */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	cusProductToPrices,
	isFixedPrice,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductNotPresent } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { createStripeFixedPriceUnderProduct } from "@tests/integration/billing/sync/utils/syncProductHelpers";
import { TestFeature } from "@tests/setup/v2Features";
import { timeout } from "@tests/utils/genUtils";
import chalk from "chalk";
import {
	createCustomBasePriceForProduct,
	createExternalStripeSubscription,
	createWrongUsagePrice,
	expectActiveLinkedCustomerProducts,
	expectLinkedCustomerProduct,
	expectNoLinkedCustomerProduct,
	expectStripeSubscriptionCreated,
	getFullProductFromMap,
	requireBasePrice,
	requireUsagePrice,
	setupSharedStripeFamilies,
	setupSharedStripeProductFamily,
	stripePriceIdForPrice,
	trackCustomerUsage,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";

test(`${chalk.yellowBright("customer.subscription.created auto-sync: exact variant prices win in shared Stripe product family")}`, async () => {
	const customerId = "sub-created-shared-exact";
	const baseId = "shared_exact_base";
	const variantId = "shared_exact_var";
	const variantIncluded = 100_000;

	const { autumnV1, ctx, baseFull, variantFull } =
		await setupSharedStripeProductFamily({
			customerId,
			baseId,
			variantId,
			variantIncluded,
		});
	const variantBasePrice = requireBasePrice({ fullProduct: variantFull });
	const variantUsagePrice = requireUsagePrice({ fullProduct: variantFull });

	const stripeSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [
			{ price: stripePriceIdForPrice({ price: variantBasePrice }) },
			{ price: stripePriceIdForPrice({ price: variantUsagePrice }) },
		],
	});
	expectStripeSubscriptionCreated({ subscription: stripeSubscription });

	const customer = await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [variantFull.id],
		notPresent: [baseFull.id],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: variantIncluded,
		balance: variantIncluded,
		usage: 0,
	});
	await expectLinkedCustomerProduct({
		ctx,
		stripeSubscriptionId: stripeSubscription.id,
		productId: variantFull.id,
	});
});

test(`${chalk.yellowBright("customer.subscription.created auto-sync: custom base amount selects shared Stripe product variant")}`, async () => {
	const customerId = "sub-created-shared-custom";
	const baseId = "shared_custom_base";
	const variantId = "shared_custom_var";
	const variantIncluded = 200_000;

	const { autumnV1, ctx, baseFull, variantFull } =
		await setupSharedStripeProductFamily({
			customerId,
			baseId,
			variantId,
			variantIncluded,
		});
	const customBasePrice = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: variantFull.processor!.id,
		unitAmount: 3500,
	});

	const stripeSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: customBasePrice.id }],
	});
	expectStripeSubscriptionCreated({ subscription: stripeSubscription });

	const customer = await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [variantFull.id],
		notPresent: [baseFull.id],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: variantIncluded,
		balance: variantIncluded,
		usage: 0,
	});

	const linked = await expectLinkedCustomerProduct({
		ctx,
		stripeSubscriptionId: stripeSubscription.id,
		productId: variantFull.id,
	});
	expect(linked.is_custom).toBe(false);
	const basePrice = cusProductToPrices({ cusProduct: linked }).find(isFixedPrice);
	expect(basePrice?.config.amount).toBe(35);
});

test(`${chalk.yellowBright("customer.subscription.created auto-sync: ambiguous shared Stripe product base amounts do not attach")}`, async () => {
	const customerId = "sub-created-shared-ambiguous";
	const baseId = "shared_ambiguous_base";
	const variantId = "shared_ambiguous_var_a";
	const ambiguousVariantId = "shared_ambiguous_var_b";
	const variantIncluded = 300_000;

	const {
		autumnV1,
		ctx,
		baseFull,
		variantFull,
		ambiguousVariantFull,
	} = await setupSharedStripeProductFamily({
		customerId,
		baseId,
		variantId,
		variantIncluded,
		ambiguousVariantId,
		ambiguousVariantIncluded: 400_000,
	});
	if (!ambiguousVariantFull) {
		throw new Error("Expected ambiguous variant setup to return full product");
	}

	const customBasePrice = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: variantFull.processor!.id,
		unitAmount: 3500,
	});

	const stripeSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: customBasePrice.id }],
	});
	expectStripeSubscriptionCreated({ subscription: stripeSubscription });

	await timeout(10000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({ customer, productId: baseFull.id });
	await expectProductNotPresent({ customer, productId: variantFull.id });
	await expectProductNotPresent({
		customer,
		productId: ambiguousVariantFull.id,
	});
	await expectNoLinkedCustomerProduct({
		ctx,
		stripeSubscriptionId: stripeSubscription.id,
	});
});

test(`${chalk.yellowBright("customer.subscription.created auto-sync: base shape match tolerates wrong overage price")}`, async () => {
	const customerId = "sub-created-shared-wrong-overage";
	const variantId = "shared_wrong_overage_var";
	const { autumnV1, ctx, fullProducts } = await setupSharedStripeFamilies({
		customerId,
		families: [
			{
				baseId: "shared_wrong_overage_base",
				group: "Wrong Overage Group",
				baseAmount: 20,
				featureId: TestFeature.Messages,
				baseIncluded: 50_000,
				variants: [{ id: variantId, amount: 35, included: 250_000 }],
			},
		],
	});
	const variantFull = getFullProductFromMap({ fullProducts, productId: variantId });
	const customBasePrice = await createCustomBasePriceForProduct({
		ctx,
		fullProduct: variantFull,
		amount: 35,
	});
	const wrongUsagePrice = await createWrongUsagePrice({ ctx, fullProduct: variantFull });

	const stripeSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: customBasePrice.id }, { price: wrongUsagePrice.id }],
	});
	expectStripeSubscriptionCreated({ subscription: stripeSubscription });

	const customer = await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [variantId],
		notPresent: ["shared_wrong_overage_base"],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 250_000,
		balance: 250_000,
		usage: 0,
	});
	const linked = await expectLinkedCustomerProduct({
		ctx,
		stripeSubscriptionId: stripeSubscription.id,
		productId: variantId,
	});
	expect(linked.is_custom).toBe(false);
});

test(`${chalk.yellowBright("customer.subscription.created auto-sync: separate subscriptions keep variants in different groups")}`, async () => {
	const customerId = "sub-created-shared-separate-groups";
	const groupAVariantId = "shared_separate_groups_a_var";
	const groupBVariantId = "shared_separate_groups_b_var";
	const { autumnV1, ctx, fullProducts } = await setupSharedStripeFamilies({
		customerId,
		families: [
			{
				baseId: "shared_separate_groups_a_base",
				group: "Shared Separate Group A",
				baseAmount: 20,
				featureId: TestFeature.Messages,
				baseIncluded: 25_000,
				variants: [
					{ id: groupAVariantId, amount: 35, included: 150_000 },
				],
			},
			{
				baseId: "shared_separate_groups_b_base",
				group: "Shared Separate Group B",
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

	const groupASubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [
			{ price: groupAPrice.id },
			{ price: wrongGroupAUsagePrice.id },
		],
	});
	expectStripeSubscriptionCreated({ subscription: groupASubscription });

	await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [groupAVariantId],
		notPresent: ["shared_separate_groups_a_base", "shared_separate_groups_b_base"],
	});
	await trackCustomerUsage({
		autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		value: 123,
	});

	const groupBPrice = await createCustomBasePriceForProduct({
		ctx,
		fullProduct: groupBFull,
		amount: 15,
	});
	const groupBSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: groupBPrice.id }],
	});
	expectStripeSubscriptionCreated({ subscription: groupBSubscription });

	const customer = await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [groupAVariantId, groupBVariantId],
		notPresent: ["shared_separate_groups_a_base", "shared_separate_groups_b_base"],
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
		stripeSubscriptionId: groupASubscription.id,
		productIds: [groupAVariantId],
	});
	await expectActiveLinkedCustomerProducts({
		ctx,
		stripeSubscriptionId: groupBSubscription.id,
		productIds: [groupBVariantId],
	});
});

