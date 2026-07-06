import type { CancelStateMismatch } from "@autumn/shared";
import type Stripe from "stripe";
import { isStripeSubscriptionCanceling } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { PhaseScenario } from "../compute/classifyPhaseScenario";

/**
 * Checks whether the subscription has an active schedule with future phase transitions.
 * After a schedule completes/releases, Stripe keeps the ID on the subscription
 * but the schedule status is "released" or "completed" — not active.
 */
const hasActiveScheduleWithFuturePhases = async ({
	stripeCli,
	sub,
}: {
	stripeCli: Stripe;
	sub: Stripe.Subscription;
}): Promise<boolean> => {
	if (!sub.schedule) return false;

	const scheduleId =
		typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id;
	const schedule = await stripeCli.subscriptionSchedules.retrieve(scheduleId);

	if (
		schedule.status === "released" ||
		schedule.status === "completed" ||
		schedule.status === "canceled"
	) {
		return false;
	}

	if (schedule.end_behavior === "release" && schedule.phases.length > 0) {
		const lastPhase = schedule.phases[schedule.phases.length - 1];
		const currentPhase = schedule.current_phase;
		if (currentPhase && currentPhase.start_date === lastPhase.start_date) {
			return false;
		}
	}

	return true;
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
}): Promise<CancelStateMismatch | undefined> => {
	const actualCanceling = isStripeSubscriptionCanceling(sub);

	switch (scenario) {
		case "no_phases":
			return undefined;

		case "single_indefinite": {
			const hasActiveSchedule = await hasActiveScheduleWithFuturePhases({
				stripeCli,
				sub,
			});
			if (sub.cancel_at !== null || hasActiveSchedule) {
				return {
					type: "cancel_state_mismatch",
					expected_canceling: false,
					actual_canceling: true,
				};
			}
			return undefined;
		}

		case "simple_cancel": {
			const hasActiveSchedule = await hasActiveScheduleWithFuturePhases({
				stripeCli,
				sub,
			});
			if (sub.cancel_at === null || hasActiveSchedule) {
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
