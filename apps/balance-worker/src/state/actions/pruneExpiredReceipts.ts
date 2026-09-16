import { deleteExpiredReceipts } from "../repos/mutationReceipts/mutationReceipts.js";
import type { StateStoreContext } from "../types/stateStoreContext.js";

export const pruneExpiredReceipts = ({
	ctx,
	topic,
	partition,
	expiresAtOrBefore,
	limit,
}: {
	ctx: StateStoreContext;
	topic: string;
	partition: number;
	expiresAtOrBefore: number;
	limit: number;
}): { deletedCount: number } => {
	if (!Number.isSafeInteger(expiresAtOrBefore) || expiresAtOrBefore < 0) {
		throw new RangeError(
			"expiresAtOrBefore must be a non-negative safe integer",
		);
	}
	if (!Number.isSafeInteger(limit) || limit <= 0) {
		throw new RangeError("limit must be a positive safe integer");
	}

	const result = deleteExpiredReceipts({
		ctx,
		topic,
		partition,
		expiresAtOrBefore,
		limit,
	});
	return { deletedCount: result.changes };
};
