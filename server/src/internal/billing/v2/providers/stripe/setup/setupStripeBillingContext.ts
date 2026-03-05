import type {
	AttachParamsV1,
	BillingContextOverride,
	FullCusProduct,
	FullCustomer,
	MultiAttachParamsV0,
	Product,
	UpdateSubscriptionV1Params,
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
	params,
	newBillingSubscription,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	product?: Product;
	targetCustomerProduct?: FullCusProduct;
	contextOverride?: BillingContextOverride;
	params?: AttachParamsV1 | MultiAttachParamsV0 | UpdateSubscriptionV1Params;
	newBillingSubscription?: boolean;
}) => {
	const { stripeBillingContext } = contextOverride;

	if (stripeBillingContext) return stripeBillingContext;

	const {
		stripeCus: stripeCustomer,
		paymentMethod,
		testClockFrozenTime,
	} = await fetchStripeCustomerForBilling({
		ctx,
		fullCus: fullCustomer,
	});

	// If no target customer product, skip subscription/schedule fetching
	const stripeSubscription = await fetchStripeSubscriptionForBilling({
		ctx,
		fullCus: fullCustomer,
		product,
		targetCusProductId: targetCustomerProduct?.id,
		params,
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

	const stripeDiscounts = await fetchStripeDiscountsForBilling({
		ctx,
		stripeSubscription,
		stripeCustomer,
		paramDiscounts:
			params && "discounts" in params ? params.discounts : undefined,
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
