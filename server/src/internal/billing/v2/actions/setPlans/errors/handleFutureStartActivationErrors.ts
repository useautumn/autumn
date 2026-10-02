import {
	type AutumnBillingPlan,
	type CreateScheduleBillingContext,
	CusProductStatus,
} from "@autumn/shared";
import { isOnStripeSchedule } from "@/internal/billing/v2/execute/addStripeSubscriptionScheduleIdToBillingPlan";
import { firstPhaseStartsInFuture } from "../setup/classifyFirstPhaseStart";
import { setPlansError } from "./setPlansError";

/** A later first phase only starts when its Stripe schedule does, so each of its plans must ride that schedule. */
export const handleFutureStartActivationErrors = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: CreateScheduleBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	if (!firstPhaseStartsInFuture({ billingContext })) return;
	if (billingContext.skipBillingChanges) return;

	const { starts_at: startsAt } = billingContext.immediatePhase;
	const strandedCustomerProduct = autumnBillingPlan.insertCustomerProducts.find(
		(customerProduct) =>
			customerProduct.status === CusProductStatus.Scheduled &&
			customerProduct.starts_at === startsAt &&
			!isOnStripeSchedule({ customerProduct, linksFreePlaceholders: true }),
	);
	if (!strandedCustomerProduct) return;

	throw setPlansError({
		details: {
			type: "plan_cannot_start_later",
			plan_name: strandedCustomerProduct.product.name,
			starts_at: startsAt,
		},
	});
};
