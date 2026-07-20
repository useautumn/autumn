import { ErrCode, RecaseError } from "@autumn/shared";
import { MAX_BATCH_TRANSITION_ASSIGNMENTS } from "../utils/batchTransitionConstants";

export const enforceBatchTransitionAssignmentLimit = ({
	count,
}: {
	count: number;
}) => {
	if (count <= MAX_BATCH_TRANSITION_ASSIGNMENTS) return;

	throw new RecaseError({
		message: `Batch transitions support at most ${MAX_BATCH_TRANSITION_ASSIGNMENTS} active license assignments; found ${count}.`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
