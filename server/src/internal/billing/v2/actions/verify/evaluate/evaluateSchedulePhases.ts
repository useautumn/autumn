import type { ScheduleMismatch, SubscriptionMismatch } from "@autumn/shared";
import type Stripe from "stripe";
import { similarUnix } from "@/internal/customers/attach/mergeUtils/phaseUtils/phaseUtils";
import type {
	CusPriceCatalog,
	StoredPriceCatalog,
} from "../compute/buildStoredPriceCatalog";
import { evaluateItems } from "./evaluateItems";

/** Evaluates actual Stripe schedule phases against the expected phases for a multi_phase scenario. */
export const evaluateSchedulePhases = async ({
	stripeCli,
	sub,
	scheduledPhases,
	storedPriceCatalog,
	cusPriceCatalog,
	strict,
}: {
	stripeCli: Stripe;
	sub: Stripe.Subscription;
	scheduledPhases: Stripe.SubscriptionScheduleUpdateParams.Phase[];
	storedPriceCatalog: StoredPriceCatalog;
	cusPriceCatalog: CusPriceCatalog;
	strict?: boolean;
}): Promise<SubscriptionMismatch[]> => {
	if (!sub.schedule) {
		return [
			{
				type: "schedule_mismatch",
				reason: "missing_schedule",
				expected_phase_count: scheduledPhases.length,
			} satisfies ScheduleMismatch,
		];
	}

	const scheduleId =
		typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id;
	const schedule = await stripeCli.subscriptionSchedules.retrieve(scheduleId, {
		expand: ["phases.items.price"],
	});

	const mismatches: SubscriptionMismatch[] = [];

	if (schedule.phases.length !== scheduledPhases.length) {
		mismatches.push({
			type: "schedule_mismatch",
			reason: "phase_count_mismatch",
			expected_phase_count: scheduledPhases.length,
			actual_phase_count: schedule.phases.length,
		});
	}

	for (let i = 0; i < scheduledPhases.length; i++) {
		const expectedPhase = scheduledPhases[i];
		const expectedStartSeconds = expectedPhase.start_date as number;

		const actualPhase = schedule.phases.find((phase) =>
			similarUnix({
				unix1: expectedStartSeconds * 1000,
				unix2: phase.start_date * 1000,
			}),
		);

		if (!actualPhase) {
			mismatches.push({
				type: "schedule_mismatch",
				reason: "phase_start_mismatch",
				phase_starts_at: expectedStartSeconds,
			});
			continue;
		}

		if (
			(actualPhase.billing_cycle_anchor ?? undefined) !==
			(expectedPhase.billing_cycle_anchor ?? undefined)
		) {
			mismatches.push({
				type: "schedule_mismatch",
				reason: "billing_cycle_anchor_mismatch",
				phase_starts_at: expectedStartSeconds,
			});
		}

		// Phase 0's items are already checked against the live subscription items in verify.ts.
		if (i === 0) continue;

		mismatches.push(
			...evaluateItems({
				expectedRawItems: expectedPhase.items ?? [],
				actualPhaseItems: actualPhase.items,
				storedPriceCatalog,
				cusPriceCatalog,
				phaseStartsAt: expectedStartSeconds,
				strict,
			}),
		);
	}

	return mismatches;
};
