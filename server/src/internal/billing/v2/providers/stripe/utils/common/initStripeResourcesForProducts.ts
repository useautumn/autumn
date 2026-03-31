import type { AutumnBillingPlan, BillingContext } from "@autumn/shared";
import {
	cusProductToProduct,
	isCustomerProductOnStripeSubscription,
	isCustomerProductOnStripeSubscriptionSchedule,
	isPrepaidPrice,
	type UsagePriceConfig,
} from "@autumn/shared";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkStripeProductExists } from "@/internal/products/productUtils";

export const initStripeResourcesForBillingPlan = async ({
	ctx,
	autumnBillingPlan,
	billingContext,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	billingContext: BillingContext;
}) => {
	const { db, org, env, logger } = ctx;

	const { fullCustomer, stripeSubscription, stripeSubscriptionSchedule } =
		billingContext;
	const { insertCustomerProducts } = autumnBillingPlan;

	const newProducts = insertCustomerProducts.flatMap((cp) =>
		cusProductToProduct({ cusProduct: cp }),
	);

	const batchProductUpdates = [];
	for (const product of newProducts) {
		batchProductUpdates.push(
			checkStripeProductExists({
				db,
				org,
				env,
				product,
				logger,
			}),
		);
	}
	await Promise.all(batchProductUpdates);

	const batchPriceUpdates = [];

	const internalEntityId = fullCustomer.entity?.internal_id;

	for (const product of newProducts) {
		for (const price of product.prices) {
			batchPriceUpdates.push(
				createStripePriceIFNotExist({
					ctx,
					price,
					entitlements: product.entitlements,
					product,
					internalEntityId,
					useCheckout: false,
				}),
			);
		}
	}

	// Also ensure V2 Stripe prices exist for existing customer products on the
	// same subscription/schedule. The phase builder includes these products when
	// constructing schedule items, so any prepaid price missing
	// stripe_prepaid_price_v2_id would cause a failure.
	const existingCusProducts = fullCustomer.customer_products.filter(
		(customerProduct) => {
			if (
				stripeSubscription &&
				isCustomerProductOnStripeSubscription({
					customerProduct,
					stripeSubscriptionId: stripeSubscription.id,
				})
			) {
				return true;
			}

			if (
				stripeSubscriptionSchedule &&
				isCustomerProductOnStripeSubscriptionSchedule({
					customerProduct,
					stripeSubscriptionScheduleId: stripeSubscriptionSchedule.id,
				})
			) {
				return true;
			}

			return false;
		},
	);

	for (const cusProduct of existingCusProducts) {
		const product = cusProductToProduct({ cusProduct });

		for (const price of product.prices) {
			if (!isPrepaidPrice(price)) continue;

			const config = price.config as UsagePriceConfig;
			if (config.stripe_prepaid_price_v2_id) continue;

			batchPriceUpdates.push(
				createStripePriceIFNotExist({
					ctx,
					price,
					entitlements: product.entitlements,
					product,
					internalEntityId,
					useCheckout: false,
				}),
			);
		}
	}

	await Promise.all(batchPriceUpdates);
};
