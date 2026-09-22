import {
	LockAlreadyExistsError,
	LockNotFoundError,
	type TrackCommand,
	UnsupportedCommandError,
} from "@autumn/balance-engine";
import { FlushRecordRefusedError } from "../committer/committerErrors.js";
import { PartitionProcessorStateNotFoundError } from "../processor/common/processorErrors.js";
import { SubjectNotFoundError } from "../processor/subject/subjectErrors.js";
import type { PartitionProcessor } from "../processor/types/partitionProcessor.js";
import {
	PartitionWriterCommandConflictError,
	PartitionWriterDuplicateCommandError,
	PartitionWriterStateNotFoundError,
} from "../processor/writer/writerErrors.js";
import { ConflictingMutationReceiptError } from "../state/stateStoreErrors.js";
import type { ConsumeContext } from "./types/consume.js";

/** The command already landed, under this id or a conflicting one; consuming it again changes nothing. */
const isAlreadyApplied = (cause: unknown): boolean =>
	cause instanceof PartitionWriterDuplicateCommandError ||
	cause instanceof PartitionWriterCommandConflictError ||
	cause instanceof ConflictingMutationReceiptError;

/** Refused for good: nothing landed, and a redelivery would be refused the same way. */
const isRefused = (cause: unknown): boolean =>
	cause instanceof UnsupportedCommandError ||
	cause instanceof SubjectNotFoundError ||
	cause instanceof LockAlreadyExistsError ||
	cause instanceof LockNotFoundError ||
	cause instanceof FlushRecordRefusedError ||
	cause instanceof PartitionWriterStateNotFoundError ||
	cause instanceof PartitionProcessorStateNotFoundError;

/**
 * A queued track, with nobody waiting for the reply. Anything HTTP would answer 4xx
 * is logged and dropped here; anything it would answer 5xx is thrown so Kafka redelivers.
 */
export async function consumeTrack({
	ctx,
	command,
}: {
	ctx: ConsumeContext;
	command: TrackCommand;
}): Promise<void> {
	function runTrack(processor: PartitionProcessor) {
		return processor.track({ command });
	}
	const fields = {
		commandId: command.commandId,
		requestId: command.requestId,
		customerId: command.identity.customerId,
		featureId: command.featureId,
	};
	try {
		const reply = await ctx.runtime.process(runTrack);
		if (reply.result.status !== "applied")
			ctx.logger?.warn("Queued track rejected by the balance", {
				...fields,
				reason: reply.result.reason,
			});
	} catch (cause) {
		if (isAlreadyApplied(cause)) {
			ctx.logger?.info("Queued track already applied", fields);
			return;
		}
		if (isRefused(cause)) {
			ctx.logger?.warn("Queued track refused", { ...fields, error: cause });
			return;
		}
		throw cause;
	}
}
