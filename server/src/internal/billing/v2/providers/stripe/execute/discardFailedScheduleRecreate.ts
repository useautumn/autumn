import { autumnStripeRequestOptions } from "@server/external/stripe/common/autumnStripeIdempotency";
import {
	stripeSchedulePhaseItemToUpdateParam,
	stripeSchedulePhaseToUpdateParam,
} from "@server/external/stripe/subscriptionSchedules/utils/convertStripeSubscriptionScheduleUtils";
import type Stripe from "stripe";

/** The previous schedule's phases from its current one onward; completed phases cannot be replayed. */
const previousPhasesStillAhead = (
	previousSchedule: Stripe.SubscriptionSchedule,
): Stripe.SubscriptionSchedule.Phase[] => {
	const currentPhaseStart = previousSchedule.current_phase?.start_date;
	const currentIndex = previousSchedule.phases.findIndex(
		(phase) => phase.start_date === currentPhaseStart,
	);
	return previousSchedule.phases.slice(Math.max(currentIndex, 0));
};

/**
 * A `from_subscription` schedule whose phase update was rejected is a bare,
 * release-on-end schedule: it changes nothing at period end and blocks any
 * later schedule. Put the previous phases back on it, or release it.
 */
export const discardFailedScheduleRecreate = async ({
	stripeCli,
	bareSchedule,
	previousSchedule,
	autumnMetadata,
}: {
	stripeCli: Stripe;
	bareSchedule: Stripe.SubscriptionSchedule;
	previousSchedule?: Stripe.SubscriptionSchedule;
	autumnMetadata: Stripe.MetadataParam;
}): Promise<void> => {
	const currentPhaseStart = bareSchedule.current_phase?.start_date;
	const [previousCurrentPhase, ...previousFuturePhases] = previousSchedule
		? previousPhasesStillAhead(previousSchedule)
		: [];

	if (previousSchedule && previousCurrentPhase && currentPhaseStart) {
		// Stripe rejects active phase item edits, so the first phase must mirror it.
		const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [
			{
				...stripeSchedulePhaseToUpdateParam(previousCurrentPhase),
				start_date: currentPhaseStart,
				items: bareSchedule.phases[0]?.items.map(
					stripeSchedulePhaseItemToUpdateParam,
				),
			},
			...previousFuturePhases.map(stripeSchedulePhaseToUpdateParam),
		];

		try {
			await stripeCli.subscriptionSchedules.update(
				bareSchedule.id,
				{
					phases,
					end_behavior: previousSchedule.end_behavior,
					metadata: autumnMetadata,
				},
				autumnStripeRequestOptions({ source: "schedule-rollback" }),
			);
			return;
		} catch {}
	}

	await stripeCli.subscriptionSchedules.release(
		bareSchedule.id,
		{},
		autumnStripeRequestOptions({ source: "schedule-rollback" }),
	);
};
