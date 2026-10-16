import {
	type BillingContext,
	ErrCode,
	RecaseError,
	trialAnchorsBillingCycle,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

export const assertNoBillingCycleAnchorWithTrial = ({
	billingContext,
	backdatesTrialingSubscription = false,
}: {
	billingContext: Pick<
		BillingContext,
		"requestedBillingCycleAnchor" | "trialContext"
	>;
	backdatesTrialingSubscription?: boolean;
}) => {
	if (billingContext.requestedBillingCycleAnchor === undefined) return;
	const anchoredByTrial = trialAnchorsBillingCycle({
		hasTrial: !!billingContext.trialContext?.trialEndsAt,
		backdatesTrialingSubscription,
	});
	if (!anchoredByTrial) return;

	throw new RecaseError({
		message:
			"billing_cycle_anchor cannot be used together with a free trial. The trial already controls the billing cycle start.",
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
