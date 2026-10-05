import {
	type PhaseProrationBehavior,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import type { SchedulePhaseProration } from "@/internal/billing/v2/providers/stripe/setup/resolveSchedulePhaseProrations";

export const findRequestedProrationBehavior = ({
	phaseProrations,
	phaseStartMs,
}: {
	phaseProrations: SchedulePhaseProration[];
	phaseStartMs: number;
}): PhaseProrationBehavior | undefined =>
	phaseProrations.find(
		({ startsAt }) =>
			truncateMsToSecondPrecision(startsAt) ===
			truncateMsToSecondPrecision(phaseStartMs),
	)?.prorationBehavior;

/** The proration a schedule phase start applies; undefined leaves Stripe's default, which credits unused time. */
export const resolvePhaseStartProrationBehavior = ({
	phaseProrations,
	phaseStartMs,
	resetsBillingCycle,
	changesCustomerProducts,
}: {
	phaseProrations: SchedulePhaseProration[];
	phaseStartMs: number;
	resetsBillingCycle: boolean;
	changesCustomerProducts: boolean;
}): PhaseProrationBehavior | undefined => {
	const requestedProrationBehavior = findRequestedProrationBehavior({
		phaseProrations,
		phaseStartMs,
	});
	if (requestedProrationBehavior) return requestedProrationBehavior;

	// Product switches at a reset start a full cycle without old-plan credits.
	if (resetsBillingCycle && changesCustomerProducts) return "none";
	return undefined;
};

export const phaseStartCreditsUnusedTime = ({
	prorationBehavior,
}: {
	prorationBehavior: PhaseProrationBehavior | undefined;
}) => prorationBehavior !== "none";

/** Without proration or a cycle reset, Stripe bills nothing until the next renewal. */
export const phaseStartRaisesInvoice = ({
	prorationBehavior,
	resetsBillingCycle,
}: {
	prorationBehavior: PhaseProrationBehavior | undefined;
	resetsBillingCycle: boolean;
}) => resetsBillingCycle || phaseStartCreditsUnusedTime({ prorationBehavior });
