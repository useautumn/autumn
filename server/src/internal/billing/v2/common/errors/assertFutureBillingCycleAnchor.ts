import {
	ErrCode,
	RecaseError,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

export const assertFutureBillingCycleAnchor = ({
	requestedBillingCycleAnchor,
	currentEpochMs,
}: {
	requestedBillingCycleAnchor?: number | "now";
	currentEpochMs: number;
}) => {
	if (typeof requestedBillingCycleAnchor !== "number") return;

	if (
		truncateMsToSecondPrecision(requestedBillingCycleAnchor) <=
		truncateMsToSecondPrecision(currentEpochMs)
	) {
		throw new RecaseError({
			message:
				"billing_cycle_anchor cannot be set to a past timestamp. Use 'now' or a future Unix timestamp in milliseconds.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
