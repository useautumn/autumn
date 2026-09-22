import {
	LockAlreadyExistsError,
	LockNotFoundError,
	UnsupportedCommandError,
} from "@autumn/balance-engine";
import { FlushRecordRefusedError } from "../committer/committerErrors.js";
import { PartitionProcessorStateNotFoundError } from "../processor/common/processorErrors.js";
import { SubjectNotFoundError } from "../processor/subject/subjectErrors.js";
import {
	PartitionWriterCommandConflictError,
	PartitionWriterDuplicateCommandError,
	PartitionWriterStateNotFoundError,
} from "../processor/writer/writerErrors.js";
import { ConflictingMutationReceiptError } from "../state/stateStoreErrors.js";

/**
 * What a failed queued track comes to: "applied" already landed, "refused" never will,
 * "transient" is retried by redelivery.
 */
export type TrackSettlement = "applied" | "refused" | "transient";

const isAlreadyApplied = (cause: unknown): boolean =>
	cause instanceof PartitionWriterDuplicateCommandError ||
	cause instanceof PartitionWriterCommandConflictError ||
	cause instanceof ConflictingMutationReceiptError;

const isRefused = (cause: unknown): boolean =>
	cause instanceof UnsupportedCommandError ||
	cause instanceof SubjectNotFoundError ||
	cause instanceof LockAlreadyExistsError ||
	cause instanceof LockNotFoundError ||
	cause instanceof FlushRecordRefusedError ||
	cause instanceof PartitionWriterStateNotFoundError ||
	cause instanceof PartitionProcessorStateNotFoundError;

export const settleTrackFailure = ({
	cause,
}: {
	cause: unknown;
}): TrackSettlement => {
	if (isAlreadyApplied(cause)) return "applied";
	if (isRefused(cause)) return "refused";
	return "transient";
};
