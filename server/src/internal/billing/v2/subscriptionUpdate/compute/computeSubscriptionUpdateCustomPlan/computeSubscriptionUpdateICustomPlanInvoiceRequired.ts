import type { SubscriptionUpdateV0Params } from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type { UpdateSubscriptionContext } from "../../fetch/updateSubscriptionContextSchema";

/**
 * Determines whether an invoice is required for a custom subscription update.
 *
 * Evaluates the subscription changes to decide if billing adjustments
 * (prorations, charges, credits) necessitate creating an invoice.
 *
 * @param ctx - The Autumn request context
 * @param updateSubscriptionContext - Context containing customer product and subscription details
 * @param params - The subscription update parameters from the API request
 * @returns `true` if an invoice is required, `false` otherwise
 */
export const computeSubscriptionUpdateCustomPlanInvoiceRequired = ({
	ctx,
	updateSubscriptionContext,
	params,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionContext;
	params: SubscriptionUpdateV0Params;
}) => {
	// 1. When to calculate invoice...?

	return false;
};
