import { expect } from "bun:test";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import type Stripe from "stripe";
import type { PhaseScenario } from "../classifyPhaseScenario";

/**
 * Checks whether the subscription has an active schedule with future phase transitions.
 * After a schedule completes/releases, Stripe keeps the ID on the subscription
 * but the schedule status is "released" or "completed" — not active.
 * Also, a schedule in its final phase with end_behavior "release" is effectively done
 * even if Stripe hasn't processed the release yet (test clock timing).
 */
const hasActiveScheduleWithFuturePhases = async ({
	ctx,
	sub,
}: {
	ctx: TestContext;
	sub: Stripe.Subscription;
}): Promise<boolean> => {
	if (!sub.schedule) return false;

	const scheduleId =
		typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id;
	const schedule =
		await ctx.stripeCli.subscriptionSchedules.retrieve(scheduleId);

	// Already released/completed/canceled — not active
	if (
		schedule.status === "released" ||
		schedule.status === "completed" ||
		schedule.status === "canceled"
	) {
		return false;
	}

	// Schedule is active but may be in its final phase awaiting release.
	// If end_behavior is "release" and we're in the last phase, treat as done.
	if (schedule.end_behavior === "release" && schedule.phases.length > 0) {
		const lastPhase = schedule.phases[schedule.phases.length - 1];
		const currentPhase = schedule.current_phase;
		if (currentPhase && currentPhase.start_date === lastPhase.start_date) {
			return false;
		}
	}

	return true;
};

/** Validates cancel/schedule state on a subscription based on the classified scenario. */
export const validateSubState = async ({
	ctx,
	sub,
	scenario,
	cancelAtSeconds,
	shouldBeCanceled,
	debug,
}: {
	ctx: TestContext;
	sub: Stripe.Subscription;
	scenario: PhaseScenario;
	cancelAtSeconds?: number;
	shouldBeCanceled?: boolean;
	debug?: boolean;
}) => {
	// Explicit override takes priority
	if (shouldBeCanceled === true) {
		expect(
			sub.cancel_at !== null ||
				sub.canceled_at !== null ||
				sub.cancel_at_period_end,
			"Expected subscription to be canceling",
		).toBe(true);
		return;
	}

	if (shouldBeCanceled === false) {
		expect(sub.cancel_at).toBeNull();
		expect(sub.canceled_at).toBeNull();
		return;
	}

	// Infer expectations from scenario
	switch (scenario) {
		case "no_phases":
			break;

		case "single_indefinite": {
			if (debug) {
				console.log(
					`single_indefinite: cancel_at=${sub.cancel_at}, schedule=${sub.schedule}`,
				);
			}
			expect(sub.cancel_at).toBeNull();
			const active = await hasActiveScheduleWithFuturePhases({ ctx, sub });
			expect(
				active,
				`Expected no active schedule with future phases on sub ${sub.id}, but schedule ${sub.schedule} is still active`,
			).toBe(false);
			break;
		}

		case "simple_cancel": {
			if (debug) {
				console.log(
					`simple_cancel: cancel_at=${sub.cancel_at}, expected=${cancelAtSeconds}, schedule=${sub.schedule}`,
				);
			}
			expect(sub.cancel_at).not.toBeNull();

			if (cancelAtSeconds !== undefined && sub.cancel_at !== null) {
				expect(Math.abs(sub.cancel_at - cancelAtSeconds)).toBeLessThanOrEqual(
					1,
				);
			}

			const active = await hasActiveScheduleWithFuturePhases({ ctx, sub });
			expect(
				active,
				`Expected no active schedule with future phases on sub ${sub.id} for simple_cancel`,
			).toBe(false);
			break;
		}

		case "multi_phase":
			if (debug) {
				console.log(
					`multi_phase: schedule=${sub.schedule}, cancel_at=${sub.cancel_at}`,
				);
			}
			expect(
				sub.schedule,
				`Expected subscription ${sub.id} to have a schedule`,
			).not.toBeNull();
			break;
	}
};
