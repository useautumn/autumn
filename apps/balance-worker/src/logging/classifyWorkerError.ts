import type { ErrorClassifier } from "@autumn/errors";
import { SubjectLoadBusyError } from "../processor/subject/subjectErrors.js";
import {
	OwnedPartitionNotReadyError,
	OwnedPartitionRecoveryRequiredError,
} from "../runtime/runtimeErrors.js";

export const classifyWorkerError: ErrorClassifier = ({ error }) => {
	if (error instanceof OwnedPartitionNotReadyError)
		return { kind: "infra", code: `partition_${error.status}` };
	if (error instanceof OwnedPartitionRecoveryRequiredError)
		return { kind: "infra", code: "partition_recovery_required" };
	if (error instanceof SubjectLoadBusyError)
		return { kind: "infra", code: "subject_load_busy" };
};
