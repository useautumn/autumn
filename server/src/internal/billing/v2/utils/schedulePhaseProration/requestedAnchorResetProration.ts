import {
	type BillingContext,
	PhaseProrationBehaviorSchema,
} from "@autumn/shared";
import type { SchedulePhaseProration } from "@/internal/billing/v2/providers/stripe/setup/resolveSchedulePhaseProrations";

/** Stripe applies a phase's own proration_behavior when that phase starts. */
export const requestedAnchorResetProration = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		"requestedBillingCycleAnchor" | "requestedProrationBehavior"
	>;
}): SchedulePhaseProration[] => {
	const { requestedBillingCycleAnchor, requestedProrationBehavior } =
		billingContext;
	if (typeof requestedBillingCycleAnchor !== "number") return [];

	const phaseProrationBehavior = PhaseProrationBehaviorSchema.safeParse(
		requestedProrationBehavior,
	);
	if (!phaseProrationBehavior.success) return [];

	return [
		{
			startsAt: requestedBillingCycleAnchor,
			prorationBehavior: phaseProrationBehavior.data,
		},
	];
};
