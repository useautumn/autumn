import {
	msToSeconds,
	type ProcessorItem,
	type StripeSubscriptionScheduleAction,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/createSchedule/compute/computeCreateSchedulePlan";
import { scheduleActionToParams } from "./scheduleActionToParams";
import { toProcessorItem } from "./toProcessorItem";
import type { ProcessorItemContext } from "./types/processorItemContext";

type SchedulePhase = Stripe.SubscriptionScheduleUpdateParams.Phase;

/** A schedule that ends by canceling leaves the subscription with nothing after its last phase. */
const scheduleCancelsAtSeconds = (
	scheduleParams?: Stripe.SubscriptionScheduleUpdateParams,
) => {
	if (scheduleParams?.end_behavior !== "cancel") return undefined;

	const stripePhases = scheduleParams.phases ?? [];
	const lastEndDate = stripePhases[stripePhases.length - 1]?.end_date;
	return typeof lastEndDate === "number" ? lastEndDate : undefined;
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
	const scheduleParams = scheduleActionToParams(subscriptionScheduleAction);
	const stripePhases = scheduleParams?.phases ?? [];
	const cancelsAtSeconds = scheduleCancelsAtSeconds(scheduleParams);

	return phases.slice(1).map((phase) => {
		const subscriptionCanceled =
			cancelsAtSeconds !== undefined &&
			msToSeconds(phase.startsAt) >= cancelsAtSeconds;
		if (subscriptionCanceled) return [];

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
