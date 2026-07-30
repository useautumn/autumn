import type { SubscriptionMismatch } from "@autumn/shared";
import type Stripe from "stripe";
import { isStripeSubscriptionCanceling } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { PhaseScenario } from "../compute/classifyPhaseScenario";

/**
 * Checks whether the subscription has an active schedule with future phase
 * transitions, and returns those phases' start times. After a schedule
 * completes/releases, Stripe keeps the ID on the subscription but the
 * schedule status is "released" or "completed" — not active.
 */
const getActiveScheduleState = async ({
	stripeCli,
	sub,
}: {
	stripeCli: Stripe;
	sub: Stripe.Subscription;
}): Promise<{
	scheduleActive: boolean;
	upcomingPhaseStarts: number[];
	endBehavior?: Stripe.SubscriptionSchedule.EndBehavior;
	endsAtSeconds?: number;
}> => {
	const inactive = { scheduleActive: false, upcomingPhaseStarts: [] };
	if (!sub.schedule) return inactive;

	const scheduleId =
		typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id;
	const schedule = await stripeCli.subscriptionSchedules.retrieve(scheduleId);

	if (
		schedule.status === "released" ||
		schedule.status === "completed" ||
		schedule.status === "canceled"
	) {
		return inactive;
	}

	if (schedule.end_behavior === "release" && schedule.phases.length > 0) {
		const lastPhase = schedule.phases[schedule.phases.length - 1];
		const currentPhase = schedule.current_phase;
		if (currentPhase && currentPhase.start_date === lastPhase.start_date) {
			return inactive;
		}
	}

	const nowSeconds = Math.floor(Date.now() / 1000);
	return {
		scheduleActive: true,
		upcomingPhaseStarts: schedule.phases
			.map((phase) => phase.start_date)
			.filter((startDate) => startDate > nowSeconds),
		endBehavior: schedule.end_behavior,
		endsAtSeconds: schedule.phases[schedule.phases.length - 1]?.end_date,
	};
};

/** Evaluates cancel/schedule state on a subscription against the classified scenario. */
export const evaluateCancelState = async ({
	stripeCli,
	sub,
	scenario,
	cancelAtSeconds,
}: {
	stripeCli: Stripe;
	sub: Stripe.Subscription;
	scenario: PhaseScenario;
	cancelAtSeconds?: number;
}): Promise<SubscriptionMismatch | undefined> => {
	const actualCanceling = isStripeSubscriptionCanceling(sub);

	switch (scenario) {
		case "no_phases":
			return undefined;

		case "single_indefinite": {
			const { scheduleActive, upcomingPhaseStarts } =
				await getActiveScheduleState({ stripeCli, sub });
			// An active schedule here is a phase problem, not a cancel problem.
			if (scheduleActive) {
				return {
					type: "schedule_mismatch",
					reason: "unexpected_schedule",
					actual_phase_starts_at: upcomingPhaseStarts,
				};
			}
			if (sub.cancel_at !== null) {
				return {
					type: "cancel_state_mismatch",
					expected_canceling: false,
					actual_canceling: true,
				};
			}
			return undefined;
		}

		case "simple_cancel": {
			const scheduleState = await getActiveScheduleState({ stripeCli, sub });

			// A schedule that itself cancels at the expected time IS the cancel.
			const scheduleImplementsCancel =
				scheduleState.scheduleActive &&
				scheduleState.endBehavior === "cancel" &&
				scheduleState.upcomingPhaseStarts.length === 0 &&
				(cancelAtSeconds === undefined ||
					(scheduleState.endsAtSeconds !== undefined &&
						Math.abs(scheduleState.endsAtSeconds - cancelAtSeconds) <= 1));
			if (scheduleImplementsCancel) return undefined;

			if (scheduleState.scheduleActive) {
				if (scheduleState.upcomingPhaseStarts.length > 0) {
					return {
						type: "schedule_mismatch",
						reason: "unexpected_schedule",
						actual_phase_starts_at: scheduleState.upcomingPhaseStarts,
					};
				}
				return {
					type: "cancel_state_mismatch",
					expected_canceling: true,
					actual_canceling: actualCanceling,
				};
			}

			if (sub.cancel_at === null) {
				return {
					type: "cancel_state_mismatch",
					expected_canceling: true,
					actual_canceling: actualCanceling,
				};
			}
			if (
				cancelAtSeconds !== undefined &&
				Math.abs(sub.cancel_at - cancelAtSeconds) > 1
			) {
				return {
					type: "cancel_state_mismatch",
					expected_canceling: true,
					actual_canceling: true,
				};
			}
			return undefined;
		}

		case "multi_phase":
			// Schedule presence for multi_phase is evaluated by evaluateSchedulePhases,
			// which reports a schedule_mismatch rather than a cancel-state mismatch.
			return undefined;
	}
};
