import type {
	AutumnBillingPlan,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";

type CusProductFieldUpdates = NonNullable<
	NonNullable<AutumnBillingPlan["updateCustomerProduct"]>["updates"]
>;

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
