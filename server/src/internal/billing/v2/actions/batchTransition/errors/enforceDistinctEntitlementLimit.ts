import { ErrCode, RecaseError } from "@autumn/shared";
import { MAX_DISTINCT_ENTITLEMENTS } from "../utils/batchTransitionConstants";

export const enforceDistinctEntitlementLimit = ({
	count,
}: {
	count: number;
}) => {
	if (count <= MAX_DISTINCT_ENTITLEMENTS) return;

	throw new RecaseError({
		message: `Batch transitions support at most ${MAX_DISTINCT_ENTITLEMENTS} distinct entitlement definitions; found more than ${MAX_DISTINCT_ENTITLEMENTS}.`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
