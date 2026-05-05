import type Stripe from "stripe";
import { isStripeSubscriptionSchedulePhaseCurrent } from "@/external/stripe/subscriptionSchedules/utils/classifyStripeSubscriptionScheduleUtils";
import { stripeSubscriptionToStartDate } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import { normalizePhaseItem } from "./normalizePhaseItem";
import { normalizeSubscriptionItem } from "./normalizeSubscriptionItem";
import type { PhaseSnapshot } from "./types";

/**
 * Build PhaseSnapshot[] from a Stripe subscription, schedule, or both.
 *
 *   - schedule supplied  → one snapshot per schedule phase
 *   - subscription only  → single open-ended snapshot from subscription.items
 *
 * At least one input is required.
 */
export const normalizeSubscriptionPhases = ({
	subscription,
	schedule,
	nowSec = Math.floor(Date.now() / 1000),
}: {
	subscription?: Stripe.Subscription;
	schedule?: Stripe.SubscriptionSchedule | null;
	nowSec?: number;
}): PhaseSnapshot[] => {
	if (!schedule && !subscription) {
		throw new Error(
			"normalizeSubscriptionPhases requires a subscription or a schedule",
		);
	}

	if (!schedule) {
		const items = subscription!.items.data
			.map((stripeItem) => normalizeSubscriptionItem({ stripeItem }))
			.filter((item): item is NonNullable<typeof item> => item !== null);

		return [
			{
				start_date: stripeSubscriptionToStartDate({
					stripeSubscription: subscription!,
				}),
				end_date: null,
				is_current: true,
				items,
			},
		];
	}

	return schedule.phases.map((phase, phaseIndex) => {
		const items = phase.items
			.map((phaseItem, itemIndex) =>
				normalizePhaseItem({
					phaseItem,
					syntheticId: `${phaseIndex}:${itemIndex}`,
				}),
			)
			.filter((item): item is NonNullable<typeof item> => item !== null);

		return {
			start_date: phase.start_date,
			end_date: phase.end_date ?? null,
			is_current: isStripeSubscriptionSchedulePhaseCurrent({
				phase,
				nowSeconds: nowSec,
			}),
			items,
		};
	});
};
