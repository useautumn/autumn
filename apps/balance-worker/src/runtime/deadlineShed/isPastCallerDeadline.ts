import {
	readRequestDeadlineHeader,
	WORKER_REQUEST_DEADLINE_HEADER,
} from "@autumn/balance-worker-client/protocol";
import { shedsDeadlines } from "../../experiments/deadlineShed.js";

/** The caller's clock and this task's may disagree by this much; only a request later than that is dropped. */
export const CALLER_DEADLINE_SKEW_MS = 100;

/** Arm B: the caller's own deadline has passed, counting the time the request waited before the worker read it. */
export function isPastCallerDeadline({
	headers,
	now = Date.now(),
}: {
	headers: Headers;
	now?: number;
}): boolean {
	if (!shedsDeadlines()) return false;
	const deadlineAt = readRequestDeadlineHeader({
		value: headers.get(WORKER_REQUEST_DEADLINE_HEADER),
	});
	return deadlineAt !== undefined && now > deadlineAt + CALLER_DEADLINE_SKEW_MS;
}
