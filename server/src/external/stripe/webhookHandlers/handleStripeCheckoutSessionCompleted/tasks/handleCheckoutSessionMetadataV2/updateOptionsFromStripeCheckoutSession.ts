import {
	cusProductToProduct,
	type DeferredAutumnBillingPlanData,
	featureOptionUtils,
	getStartingBalance,
	isCustomerProductEntityScoped,
	priceUtils,
} from "@autumn/shared";
import { stripeCheckoutSessionUtils } from "@/external/stripe/checkoutSessions/utils";
import type { CheckoutSessionCompletedContext } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/setupCheckoutSessionCompletedContext";
import { initCustomerEntitlementEntities } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlementEntities";

export const updateOptionsFromStripeCheckoutSession = async ({
	checkoutContext,
	deferredData,
}: {
	checkoutContext: CheckoutSessionCompletedContext;
	deferredData: DeferredAutumnBillingPlanData;
}) => {
	const { stripeCheckoutSession } = checkoutContext;
	const { billingPlan, billingContext } = deferredData;
	const { fullCustomer } = billingContext;
	const newCustomerProducts = billingPlan.autumn.insertCustomerProducts;

	for (const newCustomerProduct of newCustomerProducts) {
		const fullProduct = cusProductToProduct({
			cusProduct: newCustomerProduct,
		});

		for (let i = 0; i < newCustomerProduct.options.length; i++) {
			const featureOptions = newCustomerProduct.options[i];
			const price = featureOptionUtils.convert.toPrice({
				featureOptions,
				product: fullProduct,
			});

			if (!price || priceUtils.isTieredOneOff({ price, product: fullProduct }))
				continue;

			// Entity-scoped products use inline prices with pre-calculated amounts;
			// the checkout line item quantity is not meaningful, so keep original options.
			if (isCustomerProductEntityScoped(newCustomerProduct)) {
				continue;
			}

			const featureOptionsQuantity =
				stripeCheckoutSessionUtils.convert.toFeatureOptionsQuantity({
					stripeCheckoutSession,
					price,
					product: fullProduct,
				});

			newCustomerProduct.options[i].quantity = featureOptionsQuantity;

			// Update customer entitlement with the right balance
			const customerEntitlement =
				featureOptionUtils.convert.toCustomerEntitlement({
					featureOptions,
					customerEntitlements: newCustomerProduct.customer_entitlements,
				});

			if (customerEntitlement) {
				const startingBalance = getStartingBalance({
					entitlement: customerEntitlement.entitlement,
					options: featureOptions,
					relatedPrice: price,
				});

				const entities = initCustomerEntitlementEntities({
					entitlement: customerEntitlement.entitlement,
					customerEntities: fullCustomer.entities,
					startingBalance,
				});

				if (entities) {
					customerEntitlement.entities = entities;
				} else {
					customerEntitlement.balance = startingBalance;
				}
			}
		}
	}
};
