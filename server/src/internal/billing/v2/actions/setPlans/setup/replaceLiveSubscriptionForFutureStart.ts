import {
	type CreateScheduleBillingContext,
	type FullCusProduct,
	isCustomerProductOnStripeSubscription,
	isCustomerProductOnStripeSubscriptionSchedule,
	STRIPE_LINKED_STATUSES,
} from "@autumn/shared";
import type { TimelineOperation } from "../timeline/types/timelineDiff";
import { firstPhaseStartsInFuture } from "./classifyFirstPhaseStart";
import {
	type LiveSubscriptionFields,
	replaceStripeSubscription,
} from "./replaceStripeSubscription";

const staysOnLiveSubscription = ({
	customerProduct,
	stripeSubscriptionId,
	stripeSubscriptionScheduleId,
	removedCustomerProductIds,
}: {
	customerProduct: FullCusProduct;
	stripeSubscriptionId: string;
	stripeSubscriptionScheduleId?: string;
	removedCustomerProductIds: Set<string>;
}) => {
	if (removedCustomerProductIds.has(customerProduct.id)) return false;
	if (!STRIPE_LINKED_STATUSES.includes(customerProduct.status)) return false;
	return (
		isCustomerProductOnStripeSubscription({
			customerProduct,
			stripeSubscriptionId,
		}) === true ||
		isCustomerProductOnStripeSubscriptionSchedule({
			customerProduct,
			stripeSubscriptionScheduleId,
		}) === true
	);
};

export const replaceLiveSubscriptionForFutureStart = ({
	billingContext,
	operations,
}: {
	billingContext: CreateScheduleBillingContext;
	operations: TimelineOperation[];
}): LiveSubscriptionFields => {
	const { stripeSubscription } = billingContext;
	if (!stripeSubscription) return {};
	if (!firstPhaseStartsInFuture({ billingContext })) return {};

	const removedCustomerProductIds = new Set(
		operations.flatMap((operation) =>
			operation.type === "expire" || operation.type === "delete"
				? [operation.customerProductId]
				: [],
		),
	);
	const keepsSubscription = billingContext.fullCustomer.customer_products.some(
		(customerProduct) =>
			staysOnLiveSubscription({
				customerProduct,
				stripeSubscriptionId: stripeSubscription.id,
				stripeSubscriptionScheduleId:
					billingContext.stripeSubscriptionSchedule?.id,
				removedCustomerProductIds,
			}),
	);
	if (keepsSubscription) return {};

	return replaceStripeSubscription({
		stripeSubscription,
		stripeSubscriptionSchedule: billingContext.stripeSubscriptionSchedule,
	});
};
