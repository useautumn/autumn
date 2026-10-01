import type { ErrorClassifier } from "@autumn/errors";
import {
	OwnedPartitionNotReadyError,
	OwnedPartitionRecoveryRequiredError,
} from "../runtime/runtimeErrors.js";

/** A partition activating, draining or rebuilding answers 503 until it settles, as on every deploy: one is noise, a rate is an incident. */
export const classifyWorkerError: ErrorClassifier = ({ error }) => {
	if (error instanceof OwnedPartitionNotReadyError)
		return { kind: "infra", code: `partition_${error.status}` };
	if (error instanceof OwnedPartitionRecoveryRequiredError)
		return { kind: "infra", code: "partition_recovery_required" };
};
