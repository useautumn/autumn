import {
	type BillingBehavior,
	type CreateScheduleBillingContext,
	isCustomerProductOnStripeSubscription,
	secondsToMs,
} from "@autumn/shared";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { partitionUnchangedCustomerProducts } from "../compute/partitionUnchangedCustomerProducts";
import { resolveSetPlansRecurringProducts } from "../utils/resolveSetPlansRecurringProducts";

type KeptSubscriptionCycle = Partial<
	Pick<
		CreateScheduleBillingContext,
		"billingCycleAnchorMs" | "requestedProrationBehavior"
	>
>;

/** A replacement subscription for kept plans continues their paid cycle: anchored on the old period end, charging nothing before it. */
export const setupKeptSubscriptionCycle = ({
	ctx,
	billingContext,
	requestedProrationBehavior,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	requestedProrationBehavior?: BillingBehavior;
}): KeptSubscriptionCycle => {
	const { replacedStripeSubscription, currentEpochMs } = billingContext;
	if (!replacedStripeSubscription?.items.data.length) return {};

	const { recurringOutgoing } = resolveSetPlansRecurringProducts({
		billingContext,
	});
	const { keptCustomerProducts } = partitionUnchangedCustomerProducts({
		ctx,
		billingContext,
		currentRecurringCustomerProducts: recurringOutgoing,
	});
	const keepsReplacedPlan = keptCustomerProducts.some(({ customerProduct }) =>
		isCustomerProductOnStripeSubscription({
			customerProduct,
			stripeSubscriptionId: replacedStripeSubscription.id,
		}),
	);
	if (!keepsReplacedPlan) return {};

	const periodEndMs = secondsToMs(
		getLatestPeriodEnd({ sub: replacedStripeSubscription }),
	);
	if (periodEndMs <= currentEpochMs) return {};

	return {
		billingCycleAnchorMs: periodEndMs,
		requestedProrationBehavior: requestedProrationBehavior ?? "none",
	};
};
