import type { FullCusProduct, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { fetchStripeCustomerForBilling } from "./fetchStripeCustomerForBilling";
import { fetchStripeSubscriptionForBilling } from "./fetchStripeSubscriptionForBilling";
import { fetchStripeSubscriptionScheduleForBilling } from "./fetchStripeSubscriptionScheduleForBilling";
import { setupStripeDiscountsForBilling } from "./setupStripeDiscountsForBilling";

export const setupStripeBillingContext = async ({
	ctx,
	fullCustomer,
	targetCustomerProduct,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	targetCustomerProduct?: FullCusProduct;
}) => {
	// If no target customer product, skip subscription/schedule fetching
	const stripeSubscription = targetCustomerProduct
		? await fetchStripeSubscriptionForBilling({
				ctx,
				fullCus: fullCustomer,
				products: [],
				targetCusProductId: targetCustomerProduct.id,
			})
		: undefined;

	const stripeSubscriptionSchedule = targetCustomerProduct
		? await fetchStripeSubscriptionScheduleForBilling({
				ctx,
				fullCus: fullCustomer,
				subscriptionScheduleId:
					typeof stripeSubscription?.schedule === "string"
						? stripeSubscription.schedule
						: undefined,
				products: [],
				targetCusProductId: targetCustomerProduct.id,
			})
		: undefined;

	const {
		stripeCus: stripeCustomer,
		paymentMethod,
		testClockFrozenTime,
	} = await fetchStripeCustomerForBilling({
		ctx,
		fullCus: fullCustomer,
	});

	const stripeDiscounts = setupStripeDiscountsForBilling({
		stripeSubscription,
		stripeCustomer,
	});

	return {
		stripeSubscription,
		stripeSubscriptionSchedule,
		stripeCustomer,
		stripeDiscounts,
		paymentMethod,
		testClockFrozenTime,
	};
};
