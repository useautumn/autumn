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
	targetCustomerProduct: FullCusProduct;
}) => {
	const stripeSubscription = await fetchStripeSubscriptionForBilling({
		ctx,
		fullCus: fullCustomer,
		products: [],
		targetCusProductId: targetCustomerProduct.id,
	});

	const stripeSubscriptionSchedule =
		await fetchStripeSubscriptionScheduleForBilling({
			ctx,
			fullCus: fullCustomer,
			subscriptionScheduleId:
				typeof stripeSubscription?.schedule === "string"
					? stripeSubscription.schedule
					: undefined,
			products: [],
			targetCusProductId: targetCustomerProduct.id,
		});

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
