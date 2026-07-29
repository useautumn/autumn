import { ErrCode, RecaseError } from "@autumn/shared";
import { MAX_DISTINCT_BASE_PRICES } from "../utils/batchTransitionConstants";

export const enforceDistinctBasePriceLimit = ({ count }: { count: number }) => {
	if (count <= MAX_DISTINCT_BASE_PRICES) return;

	throw new RecaseError({
		message: `Batch transitions support at most ${MAX_DISTINCT_BASE_PRICES} distinct base price definitions; found more than ${MAX_DISTINCT_BASE_PRICES}.`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
