import {
	type TransactionRetry,
	transactionRetryWithin,
} from "../../../producer/sendTransactionalBatch.js";

export const OWNERSHIP_PUBLISH_RETRY_DEADLINE_MS = 2_000;

export function ownershipPublishRetry(): TransactionRetry {
	return transactionRetryWithin({
		deadlineMs: OWNERSHIP_PUBLISH_RETRY_DEADLINE_MS,
	});
}
