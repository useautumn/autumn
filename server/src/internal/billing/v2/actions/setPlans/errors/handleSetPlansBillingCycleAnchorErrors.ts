import {
	type CreateScheduleBillingContext,
	ErrCode,
	isOneOffProduct,
	RecaseError,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { assertFutureBillingCycleAnchor } from "@/internal/billing/v2/common/errors/assertFutureBillingCycleAnchor";

const invalidAnchor = (message: string) =>
	new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});

const anchorIsAfter = ({
	anchorMs,
	boundaryMs,
}: {
	anchorMs: number;
	boundaryMs?: number;
}) =>
	boundaryMs !== undefined &&
	truncateMsToSecondPrecision(anchorMs) >
		truncateMsToSecondPrecision(boundaryMs);

export const handleSetPlansBillingCycleAnchorErrors = ({
	billingContext,
	endsAt,
}: {
	billingContext: CreateScheduleBillingContext;
	endsAt?: number;
}) => {
	const { requestedBillingCycleAnchor, currentEpochMs } = billingContext;
	if (requestedBillingCycleAnchor === undefined) return;

	assertFutureBillingCycleAnchor({
		requestedBillingCycleAnchor,
		currentEpochMs,
	});

	if (
		billingContext.fullProducts.every((product) => isOneOffProduct({ product }))
	) {
		throw invalidAnchor(
			"billing_cycle_anchor is not supported when every plan is one-off. One-off plans do not have a recurring billing cycle.",
		);
	}

	if (typeof requestedBillingCycleAnchor !== "number") return;

	if (
		anchorIsAfter({ anchorMs: requestedBillingCycleAnchor, boundaryMs: endsAt })
	) {
		throw invalidAnchor("billing_cycle_anchor cannot be after ends_at.");
	}

	// A live subscription resets through a schedule phase, which must land before the next phase.
	const resetsLiveSubscription =
		billingContext.stripeSubscription !== undefined;
	if (
		resetsLiveSubscription &&
		anchorIsAfter({
			anchorMs: requestedBillingCycleAnchor,
			boundaryMs: billingContext.futurePhases[0]?.starts_at,
		})
	) {
		throw invalidAnchor(
			"billing_cycle_anchor cannot be after the first future phase starts.",
		);
	}
};
