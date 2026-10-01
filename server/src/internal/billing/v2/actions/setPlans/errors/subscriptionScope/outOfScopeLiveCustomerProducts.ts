import {
	type CreateScheduleBillingContext,
	customerProductHasRelevantStatus,
	ErrCode,
	type FullCusProduct,
	isCusProductOnEntity,
	RecaseError,
	type SetPlansSubscriptionConflict,
} from "@autumn/shared";
import { isCustomerProductInStripeSubscriptionScope } from "../../subscriptionScope/isCustomerProductInStripeSubscriptionScope";

/** Live plans on the plan's entity that the targeted subscription doesn't cover. */
export const outOfScopeLiveCustomerProducts = ({
	billingContext,
	internalEntityId,
}: {
	billingContext: Pick<
		CreateScheduleBillingContext,
		"fullCustomer" | "stripeSubscriptionScope"
	>;
	internalEntityId?: string;
}): FullCusProduct[] =>
	billingContext.fullCustomer.customer_products.filter(
		(customerProduct) =>
			customerProductHasRelevantStatus(customerProduct) &&
			isCusProductOnEntity({ cusProduct: customerProduct, internalEntityId }) &&
			!isCustomerProductInStripeSubscriptionScope({
				stripeSubscriptionScope: billingContext.stripeSubscriptionScope,
				customerProduct,
			}),
	);

/** Named after its main plan, the way the dashboard names subscriptions. */
const stripeSubscriptionPlanName = ({
	customerProducts,
	stripeSubscriptionId,
}: {
	customerProducts: FullCusProduct[];
	stripeSubscriptionId: string;
}) => {
	const onSubscription = customerProducts.filter(
		(customerProduct) =>
			customerProductHasRelevantStatus(customerProduct) &&
			customerProduct.subscription_ids?.includes(stripeSubscriptionId),
	);
	const namedPlan =
		onSubscription.find(({ product }) => !product.is_add_on) ??
		onSubscription[0];
	return namedPlan?.product.name;
};

/** Thrown when a targeted request would change a plan on another subscription. */
export const subscriptionConflictError = ({
	billingContext,
	conflict,
	requestedPlanName,
	conflictingCustomerProduct,
}: {
	billingContext: Pick<CreateScheduleBillingContext, "fullCustomer">;
	conflict: SetPlansSubscriptionConflict["conflict"];
	requestedPlanName: string;
	conflictingCustomerProduct: FullCusProduct;
}) => {
	const conflictingPlanName = conflictingCustomerProduct.product.name;
	const [stripeSubscriptionId] =
		conflictingCustomerProduct.subscription_ids ?? [];

	if (!stripeSubscriptionId) {
		return new RecaseError({
			code: ErrCode.InvalidRequest,
			statusCode: 400,
			message:
				conflict === "replaces"
					? `Adding ${requestedPlanName} would replace ${conflictingPlanName}, which is billed outside any Stripe subscription.`
					: `${requestedPlanName} is already billed outside any Stripe subscription, so it can't be edited here.`,
		});
	}

	const subscriptionPlanName =
		stripeSubscriptionPlanName({
			customerProducts: billingContext.fullCustomer.customer_products,
			stripeSubscriptionId,
		}) ?? conflictingPlanName;
	const details: SetPlansSubscriptionConflict = {
		type: "plan_on_another_subscription",
		conflict,
		requested_plan_name: requestedPlanName,
		conflicting_plan_name: conflictingPlanName,
		stripe_subscription_id: stripeSubscriptionId,
		subscription_plan_name: subscriptionPlanName,
	};
	const problem =
		conflict === "replaces"
			? `Adding ${requestedPlanName} would replace ${conflictingPlanName} on the ${subscriptionPlanName} subscription.`
			: `${requestedPlanName} is already on the ${subscriptionPlanName} subscription.`;

	return new RecaseError({
		code: ErrCode.InvalidRequest,
		statusCode: 400,
		message: `${problem} Open that subscription to change it.`,
		details,
	});
};
