import type { RetryBudget } from "./types/retryBudget.js";

const isPersistentFailure = (receiveCount: number) =>
	receiveCount === 3 || receiveCount % 10 === 0;

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
