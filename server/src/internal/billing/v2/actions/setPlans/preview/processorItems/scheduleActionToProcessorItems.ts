import {
	msToSeconds,
	type ProcessorItem,
	type StripeSubscriptionScheduleAction,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/createSchedule/compute/computeCreateSchedulePlan";
import { toProcessorItem } from "./toProcessorItem";
import type { ProcessorItemContext } from "./types/processorItemContext";

type SchedulePhase = Stripe.SubscriptionScheduleUpdateParams.Phase;

const scheduleActionToStripePhases = (
	subscriptionScheduleAction?: StripeSubscriptionScheduleAction,
): SchedulePhase[] => {
	switch (subscriptionScheduleAction?.type) {
		case "create":
		case "update":
			return subscriptionScheduleAction.params.phases ?? [];
		default:
			return [];
	}
};

const startsBy = ({
	stripePhase,
	startsAt,
}: {
	stripePhase: SchedulePhase;
	startsAt: number;
}) =>
	typeof stripePhase.start_date === "number" &&
	stripePhase.start_date <= msToSeconds(startsAt);

/** The Stripe phase in effect at `startsAt`: the last one that has already started. */
const stripePhaseActiveAt = ({
	stripePhases,
	startsAt,
}: {
	stripePhases: SchedulePhase[];
	startsAt: number;
}) =>
	stripePhases
		.filter((stripePhase) => startsBy({ stripePhase, startsAt }))
		.pop();

/** Items Stripe will hold at the start of each future phase, read straight off the schedule. */
export const scheduleActionToProcessorItems = ({
	subscriptionScheduleAction,
	phases,
	context,
}: {
	subscriptionScheduleAction?: StripeSubscriptionScheduleAction;
	phases: SchedulePhasePlan[];
	context: ProcessorItemContext;
}): ProcessorItem[][] => {
	const stripePhases = scheduleActionToStripePhases(subscriptionScheduleAction);

	return phases.slice(1).map((phase) => {
		const stripePhase = stripePhaseActiveAt({
			stripePhases,
			startsAt: phase.startsAt,
		});

		return (stripePhase?.items ?? []).map((item) =>
			toProcessorItem({
				stripePriceId: item.price,
				inlinePriceData: item.price_data,
				metadata: item.metadata,
				quantity: item.quantity,
				context,
			}),
		);
	});
};
