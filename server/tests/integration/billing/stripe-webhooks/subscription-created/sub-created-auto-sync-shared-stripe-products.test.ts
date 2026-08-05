/** TDD contract: subscription-created auto-sync must select exact variants.
 * The test must create a real external Stripe sub before sync assertions.
 * Slice 1/2: exact-variant, custom base amount, and ambiguous base amounts. */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	cusProductToPrices,
	isFixedPrice,
} from "@autumn/shared";
import {
	createExternalStripeSubscription,
	expectLinkedCustomerProduct,
	expectNoLinkedCustomerProduct,
	expectStripeSubscriptionCreated,
	requireBasePrice,
	requireUsagePrice,
	setupSharedStripeProductFamily,
	stripePriceIdForPrice,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import { createStripeFixedPriceUnderProduct } from "@tests/integration/billing/sync/utils/syncProductHelpers";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductNotPresent } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { timeout } from "@tests/utils/genUtils";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("customer.subscription.created auto-sync: exact variant prices win in shared Stripe product family")}`,
	async () => {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("customer.subscription.created auto-sync: custom base amount selects shared Stripe product variant")}`,
	async () => {
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
		const basePrice = cusProductToPrices({ cusProduct: linked }).find(
			isFixedPrice,
		);
		expect(basePrice?.config.amount).toBe(35);
	},
);

test.concurrent(
	`${chalk.yellowBright("customer.subscription.created auto-sync: ambiguous shared Stripe product base amounts do not attach")}`,
	async () => {
		const customerId = "sub-created-shared-ambiguous";
		const baseId = "shared_ambiguous_base";
		const variantId = "shared_ambiguous_var_a";
		const ambiguousVariantId = "shared_ambiguous_var_b";
		const variantIncluded = 300_000;

		const { autumnV1, ctx, baseFull, variantFull, ambiguousVariantFull } =
			await setupSharedStripeProductFamily({
				customerId,
				baseId,
				variantId,
				variantIncluded,
				ambiguousVariantId,
				ambiguousVariantIncluded: 400_000,
			});
		if (!ambiguousVariantFull) {
			throw new Error(
				"Expected ambiguous variant setup to return full product",
			);
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
	},
);
