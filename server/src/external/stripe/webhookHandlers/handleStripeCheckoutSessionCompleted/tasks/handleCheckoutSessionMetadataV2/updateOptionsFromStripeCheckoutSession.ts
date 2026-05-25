import {
	addCusProductToCusEnt,
	cusEntToCusPrice,
	cusProductToProduct,
	type DeferredAutumnBillingPlanData,
	featureOptionUtils,
	getStartingBalance,
	isCustomerProductEntityScoped,
	priceUtils,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
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

			const customerEntitlement =
				featureOptionUtils.convert.toCustomerEntitlement({
					featureOptions,
					customerEntitlements: newCustomerProduct.customer_entitlements,
				});

			if (!customerEntitlement) continue;

			const cusEntWithCusProduct = addCusProductToCusEnt({
				cusEnt: customerEntitlement,
				cusProduct: newCustomerProduct,
			});

			const customerPrice = cusEntToCusPrice({ cusEnt: cusEntWithCusProduct });

			if (!price || priceUtils.isTieredOneOff({ price, product: fullProduct }))
				continue;

			// Entity-scoped products use inline prices with pre-calculated amounts;
			// the checkout line item quantity is not meaningful, so keep original options.
			if (isCustomerProductEntityScoped(newCustomerProduct)) continue;

			const lineItem = stripeCheckoutSessionUtils.find.lineItemByAutumnPrice({
				lineItems: stripeCheckoutSession.line_items?.data ?? [],
				price,
				product: fullProduct,
				customerPrice,
			});

			if (lineItem?.metadata?.inline_price) continue;

			const featureOptionsQuantity =
				stripeCheckoutSessionUtils.convert.toFeatureOptionsQuantity({
					stripeCheckoutSession,
					price,
					product: fullProduct,
				});

			if (customerEntitlement) {
				// The compute-time balance already has any existing-usage carry-over
				// applied. Stripe may report a quantity that differs from what we
				// initially planned (e.g. the customer edited it on the hosted
				// checkout page) — apply only the *delta* in starting balance to the
				// existing balance so the carry-over is preserved.
				const oldStartingBalance = getStartingBalance({
					entitlement: customerEntitlement.entitlement,
					options: featureOptions,
					relatedPrice: price,
				});

				newCustomerProduct.options[i].quantity = featureOptionsQuantity;

				const newStartingBalance = getStartingBalance({
					entitlement: customerEntitlement.entitlement,
					options: newCustomerProduct.options[i],
					relatedPrice: price,
				});

				const entities = initCustomerEntitlementEntities({
					entitlement: customerEntitlement.entitlement,
					customerEntities: fullCustomer.entities,
					startingBalance: newStartingBalance,
				});

				if (entities) {
					customerEntitlement.entities = entities;
				} else {
					const startingBalanceDelta = new Decimal(newStartingBalance).sub(
						oldStartingBalance,
					);
					customerEntitlement.balance = new Decimal(
						customerEntitlement.balance ?? 0,
					)
						.add(startingBalanceDelta)
						.toNumber();
				}
			}
		}
	}
};
