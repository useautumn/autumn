import type { WorkerErrorResponse } from "@autumn/balance-worker-client/protocol";
import { MutationBatchAppendError } from "../../../processor/writer/writerErrors.js";

/**
 * What a held reply answers when its write will not be confirmed. Both cases are retryable: a refused append
 * applied nothing, and a write whose outcome is unknown is deduplicated by its command id on retry.
 */
export function heldFailureOf({ cause }: { cause: unknown }): {
	status: number;
	body: string;
} {
	const error: WorkerErrorResponse["error"] =
		cause instanceof MutationBatchAppendError
			? {
					code: "NOT_READY",
					message:
						"The write did not reach the log; nothing was applied, retry",
				}
			: {
					code: "NOT_READY",
					message:
						"The partition's writer stopped before the write was confirmed; retry",
				};
	return { status: 503, body: JSON.stringify({ error }) };
}
