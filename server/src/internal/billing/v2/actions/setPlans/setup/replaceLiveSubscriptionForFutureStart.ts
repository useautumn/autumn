import {
	type CreateScheduleBillingContext,
	CusProductStatus,
	customerProductHasActiveStatus,
	type FullCusProduct,
	isCustomerProductOnStripeSubscription,
	isCustomerProductOnStripeSubscriptionSchedule,
} from "@autumn/shared";
import type { TimelineOperation } from "../timeline/types/timelineDiff";
import { firstPhaseStartsInFuture } from "./classifyFirstPhaseStart";

type LiveSubscriptionFields = Partial<
	Pick<
		CreateScheduleBillingContext,
		| "stripeSubscription"
		| "stripeSubscriptionSchedule"
		| "replacedStripeSubscription"
	>
>;

const isLiveOrScheduled = (customerProduct: FullCusProduct) =>
	customerProductHasActiveStatus(customerProduct) ||
	customerProduct.status === CusProductStatus.Scheduled;

/** A plan the request leaves running on the live subscription or its schedule. */
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
	if (!isLiveOrScheduled(customerProduct)) return false;
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

/** A later start ends the live plans now; once none is left on the subscription, it is cancelled rather than kept empty. */
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

	return {
		stripeSubscription: undefined,
		stripeSubscriptionSchedule: undefined,
		replacedStripeSubscription: stripeSubscription,
	};
};
