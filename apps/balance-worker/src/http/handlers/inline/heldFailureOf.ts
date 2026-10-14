import type { WorkerErrorResponse } from "@autumn/balance-worker-client/protocol";
import { MutationBatchAppendError } from "../../../processor/writer/writerErrors.js";
import { workerErrorOf } from "../errorHandler/workerErrorOf.js";

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
