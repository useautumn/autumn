/** TDD contract: subscription-created auto-sync must select exact variants.
 * The test must create a real external Stripe sub before sync assertions.
 * Slice 2/2: wrong overage price tolerance, and separate subscriptions across
 * different groups. */

import { expect, test } from "bun:test";
import {
	createCustomBasePriceForProduct,
	createExternalStripeSubscription,
	createWrongUsagePrice,
	expectActiveLinkedCustomerProducts,
	expectLinkedCustomerProduct,
	expectStripeSubscriptionCreated,
	getFullProductFromMap,
	setupSharedStripeFamilies,
	trackCustomerUsage,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("customer.subscription.created auto-sync: base shape match tolerates wrong overage price")}`,
	async () => {
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
		const variantFull = getFullProductFromMap({
			fullProducts,
			productId: variantId,
		});
		const customBasePrice = await createCustomBasePriceForProduct({
			ctx,
			fullProduct: variantFull,
			amount: 35,
		});
		const wrongUsagePrice = await createWrongUsagePrice({
			ctx,
			fullProduct: variantFull,
		});

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
	},
);

test.concurrent(
	`${chalk.yellowBright("customer.subscription.created auto-sync: separate subscriptions keep variants in different groups")}`,
	async () => {
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
					variants: [{ id: groupAVariantId, amount: 35, included: 150_000 }],
				},
				{
					baseId: "shared_separate_groups_b_base",
					group: "Shared Separate Group B",
					baseAmount: 10,
					featureId: TestFeature.Words,
					baseIncluded: 1_000,
					variants: [{ id: groupBVariantId, amount: 15, included: 5_000 }],
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
			items: [{ price: groupAPrice.id }, { price: wrongGroupAUsagePrice.id }],
		});
		expectStripeSubscriptionCreated({ subscription: groupASubscription });

		await waitForCustomerProducts({
			autumnV1,
			customerId,
			active: [groupAVariantId],
			notPresent: [
				"shared_separate_groups_a_base",
				"shared_separate_groups_b_base",
			],
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
			notPresent: [
				"shared_separate_groups_a_base",
				"shared_separate_groups_b_base",
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
	},
);
