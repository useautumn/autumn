import type {
	AttachDiscount,
	BillingContextOverride,
	FullCusProduct,
	FullCustomer,
	Product,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { fetchStripeCustomerForBilling } from "./fetchStripeCustomerForBilling";
import { fetchStripeDiscountsForBilling } from "./fetchStripeDiscountsForBilling";
import { fetchStripeSubscriptionForBilling } from "./fetchStripeSubscriptionForBilling";
import { fetchStripeSubscriptionScheduleForBilling } from "./fetchStripeSubscriptionScheduleForBilling";

export const setupStripeBillingContext = async ({
	ctx,
	fullCustomer,
	product,
	targetCustomerProduct,
	contextOverride = {},
	paramDiscounts,
	newBillingSubscription,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	product?: Product;
	targetCustomerProduct?: FullCusProduct;
	contextOverride?: BillingContextOverride;
	paramDiscounts?: AttachDiscount[];
	newBillingSubscription?: boolean;
}) => {
	const { stripeBillingContext } = contextOverride;

	if (stripeBillingContext) return stripeBillingContext;

	// If no target customer product, skip subscription/schedule fetching
	const stripeSubscription = await fetchStripeSubscriptionForBilling({
		ctx,
		fullCus: fullCustomer,
		product,
		targetCusProductId: targetCustomerProduct?.id,
		newBillingSubscription,
	});

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

	const stripeDiscounts = await fetchStripeDiscountsForBilling({
		ctx,
		stripeSubscription,
		stripeCustomer,
		paramDiscounts,
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
