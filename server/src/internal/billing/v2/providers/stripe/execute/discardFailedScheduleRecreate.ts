import { autumnStripeRequestOptions } from "@server/external/stripe/common/autumnStripeIdempotency";
import { stripeSchedulePhaseItemToUpdateParam } from "@server/external/stripe/subscriptionSchedules/utils/convertStripeSubscriptionScheduleUtils";
import type Stripe from "stripe";

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
	const [previousCurrentPhase, ...previousFuturePhases] =
		previousSchedule?.phases ?? [];

	if (previousSchedule && previousCurrentPhase && currentPhaseStart) {
		// Stripe rejects active phase item edits, so the first phase must mirror it.
		const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [
			{
				start_date: currentPhaseStart,
				end_date: previousCurrentPhase.end_date ?? undefined,
				items: bareSchedule.phases[0]?.items.map(
					stripeSchedulePhaseItemToUpdateParam,
				),
			},
			...previousFuturePhases.map((phase) => ({
				start_date: phase.start_date,
				end_date: phase.end_date ?? undefined,
				proration_behavior: phase.proration_behavior,
				items: phase.items.map(stripeSchedulePhaseItemToUpdateParam),
			})),
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
