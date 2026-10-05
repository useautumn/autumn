import type { WorkerErrorResponse } from "@autumn/balance-worker-client/protocol";
import { MutationBatchAppendError } from "../../../processor/writer/writerErrors.js";
import { workerErrorOf } from "../errorHandler/workerErrorOf.js";

/**
 * What a held reply answers when its write will not be confirmed. A refused append applied nothing, so it is
 * retryable; any other cause leaves the outcome unknown, and is answered as the ordinary route answers it.
 */
export function heldFailureOf({ cause }: { cause: unknown }): {
	status: number;
	body: string;
} {
	if (cause instanceof MutationBatchAppendError) {
		const error: WorkerErrorResponse["error"] = {
			code: "NOT_READY",
			message: "The write did not reach the log; nothing was applied, retry",
		};
		return { status: 503, body: JSON.stringify({ error }) };
	}
	const { status, error } = workerErrorOf({ cause });
	return { status, body: JSON.stringify({ error }) };
}
