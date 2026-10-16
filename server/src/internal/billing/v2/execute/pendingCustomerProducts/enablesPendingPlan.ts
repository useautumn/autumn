import type { UpdateSubscriptionV1Params } from "@autumn/shared";

export const enablesPendingPlan = ({
	params,
}: {
	params: UpdateSubscriptionV1Params;
}): boolean =>
	Boolean(params.customer_product_id) &&
	params.invoice_mode?.enable_plan_immediately === true;
