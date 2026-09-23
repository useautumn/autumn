import type { SubscriptionMismatch } from "@autumn/shared";
import { differenceInSeconds, fromUnixTime } from "date-fns";
import type Stripe from "stripe";
import { isStripeSubscriptionCanceling } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { PhaseScenario } from "../compute/classifyPhaseScenario";
import {
	IGNORED_VERIFY_RULES,
	orgIgnoresVerifyRule,
} from "../ignoredVerifyMismatches";
import { isQuantityOnlySchedule } from "./isQuantityOnlySchedule";

const cancelsAtSameTime = ({
	actualSeconds,
	expectedSeconds,
}: {
	actualSeconds: number;
	expectedSeconds: number;
}) =>
	Math.abs(
		differenceInSeconds(
			fromUnixTime(actualSeconds),
			fromUnixTime(expectedSeconds),
		),
	) <= 1;

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
	quantityOnly?: boolean;
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
		quantityOnly: isQuantityOnlySchedule({ schedule }),
	};
};

/** Evaluates cancel/schedule state on a subscription against the classified scenario. */
export const evaluateCancelState = async ({
	stripeCli,
	sub,
	scenario,
	cancelAtSeconds,
	orgId,
}: {
	stripeCli: Stripe;
	sub: Stripe.Subscription;
	scenario: PhaseScenario;
	cancelAtSeconds?: number;
	orgId: string;
}): Promise<SubscriptionMismatch | undefined> => {
	const actualCanceling = isStripeSubscriptionCanceling(sub);
	const ignoresQuantityOnly = orgIgnoresVerifyRule({
		orgId,
		rule: IGNORED_VERIFY_RULES.quantityOnlySchedule,
	});

	switch (scenario) {
		case "no_phases":
			return undefined;

		case "single_indefinite": {
			const { scheduleActive, upcomingPhaseStarts, quantityOnly } =
				await getActiveScheduleState({ stripeCli, sub });
			// An active schedule here is a phase problem, not a cancel problem.
			if (scheduleActive && !(quantityOnly && ignoresQuantityOnly)) {
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
						cancelsAtSameTime({
							actualSeconds: scheduleState.endsAtSeconds,
							expectedSeconds: cancelAtSeconds,
						})));
			if (scheduleImplementsCancel) return undefined;

			const cancelAtImplementsCancel =
				scheduleState.upcomingPhaseStarts.length === 0 &&
				sub.cancel_at !== null &&
				cancelAtSeconds !== undefined &&
				cancelsAtSameTime({
					actualSeconds: sub.cancel_at,
					expectedSeconds: cancelAtSeconds,
				});
			if (cancelAtImplementsCancel) return undefined;

			if (scheduleState.scheduleActive) {
				if (
					scheduleState.upcomingPhaseStarts.length > 0 &&
					!(scheduleState.quantityOnly && ignoresQuantityOnly)
				) {
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
				!cancelsAtSameTime({
					actualSeconds: sub.cancel_at,
					expectedSeconds: cancelAtSeconds,
				})
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
