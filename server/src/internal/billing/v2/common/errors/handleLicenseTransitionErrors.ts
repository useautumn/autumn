import { type AutumnBillingPlan, ErrCode, RecaseError } from "@autumn/shared";

/** Guards incoming pool capacity against active assignments. */
export const handleLicenseTransitionErrors = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	for (const transition of autumnBillingPlan.customerLicenseTransitions ?? []) {
		const { updates } = transition;
		const liveSeats = updates.granted - updates.remaining;

		if (updates.remaining < 0) {
			throw new RecaseError({
				message:
					`License changes conflict with active license assignments: ` +
					`${liveSeats} assigned, but the incoming plan grants ${updates.granted}. Release licenses first.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}
};
