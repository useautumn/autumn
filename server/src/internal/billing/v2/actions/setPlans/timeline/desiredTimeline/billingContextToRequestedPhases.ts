import {
	type CreateScheduleBillingContext,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import type { RequestedPhase } from "./types/requestedPhase";

/** The opening phase runs from now: its plans plus the unscheduled ones, then each scheduled phase. */
export const billingContextToRequestedPhases = ({
	billingContext,
	now,
}: {
	billingContext: CreateScheduleBillingContext;
	now: number;
}): RequestedPhase[] => {
	const openingPhase: RequestedPhase = {
		startsAt: now,
		resetsBillingCycle: false,
		plans: billingContext.productContexts.map((productContext, planIndex) => ({
			fullProduct: productContext.fullProduct,
			featureQuantities: productContext.featureQuantities,
			customerLicenseQuantities: productContext.customerLicenseQuantities,
			internalEntityId: productContext.fullCustomer.entity?.internal_id ?? null,
			externalId: productContext.externalId,
			ongoing: productContext.unscheduled === true,
			source:
				productContext.unscheduled === true
					? { type: "ongoing", planIndex }
					: { type: "phase", phaseIndex: 0, planIndex },
		})),
	};

	const scheduledPhases = billingContext.scheduledPhaseContexts.map(
		(phaseContext, index): RequestedPhase => ({
			startsAt: truncateMsToSecondPrecision(phaseContext.startsAt),
			resetsBillingCycle: phaseContext.billingCycleAnchor === "phase_start",
			plans: phaseContext.productContexts.map((productContext, planIndex) => ({
				fullProduct: productContext.fullProduct,
				featureQuantities: productContext.featureQuantities,
				customerLicenseQuantities: productContext.customerLicenseQuantities,
				internalEntityId: productContext.entity?.internal_id ?? null,
				externalId: productContext.externalId,
				ongoing: false,
				source: { type: "phase", phaseIndex: index + 1, planIndex },
			})),
		}),
	);

	return [openingPhase, ...scheduledPhases];
};

export const requestedEndsAt = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) =>
	billingContext.endsAt === undefined
		? null
		: truncateMsToSecondPrecision(billingContext.endsAt);
