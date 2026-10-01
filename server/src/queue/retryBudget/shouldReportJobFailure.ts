import type { RetryBudget } from "./types/retryBudget.js";

/** With no final attempt to wait for, report failures that persist: the 3rd delivery, then every 10th. */
const isPersistentFailure = (receiveCount: number) =>
	receiveCount === 3 || receiveCount % 10 === 0;

/**
 * A job failure is reported once the job has given up: now when it won't be retried, otherwise on
 * its last delivery. Earlier failures are absorbed if a redelivery succeeds.
 */
export const shouldReportJobFailure = ({
	willRetry,
	receiveCount,
	retryBudget,
}: {
	willRetry: boolean;
	receiveCount: number;
	retryBudget: RetryBudget;
}): boolean => {
	if (!willRetry) return true;
	if (!Number.isInteger(receiveCount) || receiveCount < 1) return true;

	switch (retryBudget.kind) {
		case "bounded":
			return receiveCount >= retryBudget.maxReceiveCount;
		case "unbounded":
			return isPersistentFailure(receiveCount);
		case "unknown":
			return true;
	}
};
