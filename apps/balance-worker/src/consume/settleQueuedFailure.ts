import {
	LockAlreadyExistsError,
	LockNotFoundError,
	type MutatingCommand,
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
import type { ConsumeContext } from "./types/consume.js";

/**
 * What a failed queued command comes to: "applied" already landed, "refused" never will,
 * "transient" is retried by redelivery. Every queued command fails through the same writer and store.
 */
export type QueuedCommandSettlement = "applied" | "refused" | "transient";

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

export const classifyQueuedFailure = ({
	cause,
}: {
	cause: unknown;
}): QueuedCommandSettlement => {
	if (isAlreadyApplied(cause)) return "applied";
	if (isRefused(cause)) return "refused";
	return "transient";
};

/**
 * The command stream's error boundary, the way the HTTP error handler is the request's: nobody waits for a
 * queued command, so an applied or refused failure is logged and the record is consumed, and only a
 * transient one is rethrown so Kafka redelivers it.
 */
export const settleQueuedFailure = ({
	ctx,
	command,
	cause,
}: {
	ctx: Pick<ConsumeContext, "logger">;
	command: MutatingCommand;
	cause: unknown;
}): void => {
	const fields = {
		commandType: command.type,
		commandId: command.commandId,
		requestId: command.requestId,
		customerId: command.identity.customerId,
	};
	const settlement = classifyQueuedFailure({ cause });
	if (settlement === "transient") throw cause;
	if (settlement === "applied") {
		ctx.logger?.info(`Queued ${command.type} already applied`, fields);
		return;
	}
	ctx.logger?.warn(`Queued ${command.type} refused`, {
		...fields,
		error: cause,
	});
};
