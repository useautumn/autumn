import {
	msToSeconds,
	type ProcessorItem,
	type StripeSubscriptionAction,
	type StripeSubscriptionScheduleAction,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import { scheduleActionToParams } from "./scheduleActionToParams";
import { itemParamsToProcessorItem } from "./toProcessorItem";
import type { ProcessorItemContext } from "./types/processorItemContext";

type SchedulePhase = Stripe.SubscriptionScheduleUpdateParams.Phase;

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

	return phases.map((phase) => {
		const subscriptionCanceled =
			cancelsAtSeconds !== undefined &&
			msToSeconds(phase.startsAt) >= cancelsAtSeconds;
		if (subscriptionCanceled) return [];

		const stripePhase = stripePhaseActiveAt({
			stripePhases,
			startsAt: phase.startsAt,
		});

		return (stripePhase?.items ?? []).map((item) =>
			itemParamsToProcessorItem({ item, context }),
		);
	});
};

export const phasesEndingSubscription = ({
	subscriptionAction,
	subscriptionScheduleAction,
	phases,
}: {
	subscriptionAction?: StripeSubscriptionAction;
	subscriptionScheduleAction?: StripeSubscriptionScheduleAction;
	phases: SchedulePhasePlan[];
}): boolean[] => {
	const cancelsAtSeconds = scheduleCancelsAtSeconds(
		scheduleActionToParams(subscriptionScheduleAction),
	);

	return phases.map((phase, phaseIndex) => {
		if (phaseIndex === 0) {
			return (
				subscriptionAction?.type === "cancel" ||
				subscriptionAction?.type === "cancel_immediately"
			);
		}
		if (cancelsAtSeconds === undefined) return false;
		return (
			msToSeconds(phase.startsAt) >= cancelsAtSeconds &&
			msToSeconds(phases[phaseIndex - 1].startsAt) < cancelsAtSeconds
		);
	});
};
