import type {
	AutumnBillingPlan,
	PooledBalanceOp,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { customerProductHasActiveStatus } from "@autumn/shared";
import { computeAttachPooledBalanceOps } from "@/internal/billing/v2/pooledBalances/compute/computeAttachPooledBalanceOps.js";
import { customerProductToPooledBalanceRemovalOp } from "@/internal/billing/v2/pooledBalances/compute/customerProductToPooledBalanceRemovalOp.js";

type CusProductFieldUpdates = NonNullable<
	NonNullable<AutumnBillingPlan["updateCustomerProduct"]>["updates"]
>;

export const computeFieldUpdatePooledBalanceOps = ({
	billingContext,
	params,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV1Params;
}): PooledBalanceOp[] => {
	const updatesStatus = params.status !== undefined;
	const updatesSubscription = params.processor_subscription_id !== undefined;
	if (!updatesStatus && !updatesSubscription) return [];

	const currentCustomerProduct = billingContext.customerProduct;
	const targetCustomerProduct = {
		...currentCustomerProduct,
		status: params.status ?? currentCustomerProduct.status,
		subscription_ids:
			params.processor_subscription_id === undefined
				? currentCustomerProduct.subscription_ids
				: params.processor_subscription_id
					? [params.processor_subscription_id]
					: [],
	};
	const clearsExistingSubscription =
		params.processor_subscription_id === null &&
		(currentCustomerProduct.subscription_ids?.length ?? 0) > 0;
	if (
		!customerProductHasActiveStatus(targetCustomerProduct) ||
		clearsExistingSubscription
	) {
		const removal = customerProductToPooledBalanceRemovalOp({
			customerProduct: currentCustomerProduct,
			effectiveAt: null,
		});
		return removal ? [removal] : [];
	}

	const prepared = computeAttachPooledBalanceOps({
		customerProduct: targetCustomerProduct,
		attachBillingContext: {
			billingStartsAt: billingContext.currentEpochMs,
			currentCustomerProduct,
			currentEpochMs: billingContext.currentEpochMs,
			fullCustomer: billingContext.fullCustomer,
			planTiming: "immediate",
			requestedBillingCycleAnchor: billingContext.requestedBillingCycleAnchor,
			skipBillingChanges: billingContext.skipBillingChanges,
		},
		removeCurrentSource: false,
	});

	return prepared.pooledBalanceOps;
};

export const computeFieldUpdates = ({
	params,
}: {
	params: UpdateSubscriptionV1Params;
}) => {
	const updates: CusProductFieldUpdates = {};

	if (params.processor_subscription_id !== undefined) {
		// unsets processor subscription id if it is set to a new value
		updates.subscription_ids = params.processor_subscription_id
			? [params.processor_subscription_id]
			: [];
	}

	if (params.status !== undefined) {
		updates.status = params.status;
	}

	return updates;
};
