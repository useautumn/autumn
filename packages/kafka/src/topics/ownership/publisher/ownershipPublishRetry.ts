import {
	type TransactionRetry,
	transactionRetryWithin,
} from "../../../producer/sendTransactionalBatch.js";

/** A claim or release keeps retrying a refusal only for as long as its reader
 *  would wait for it. A successor that announced `ready` waits three seconds
 *  for the predecessor's claim and then claims for itself; a claim still
 *  retrying past that would land after the successor's own and hand the
 *  partition a second route epoch. */
export const OWNERSHIP_PUBLISH_RETRY_DEADLINE_MS = 2_000;

export function ownershipPublishRetry(): TransactionRetry {
	return transactionRetryWithin({
		deadlineMs: OWNERSHIP_PUBLISH_RETRY_DEADLINE_MS,
	});
}
