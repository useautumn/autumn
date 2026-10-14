import type {
	AtomFinalizeCommand,
	FinalizeCommand,
	TrackCommand,
	WorkerLock,
} from "@autumn/balance-engine";
import { landAtomSeqOnly } from "./consumeTrack.js";
import { resolveLockRow } from "./resolveLockRow.js";
import { classifyQueuedFailure } from "./settleQueuedFailure.js";
import type { ConsumeContext } from "./types/consume.js";
import type { QueuedCommand } from "./types/queuedCommand.js";

/** The held row is the lock the Atom named only when its customer, entity and feature are the command's. */
const namesHeldLock = ({
	command: { identity, featureId },
	lock,
}: {
	command: AtomFinalizeCommand;
	lock: WorkerLock;
}): boolean =>
	lock.customer_id === identity.customerId &&
	lock.entity_id === identity.entityId &&
	lock.feature_id === featureId;

/** The finalize the API would send for this row: its identity from the row, the settlement from the Atom. */
const finalizeCommandOf = ({
	command,
	lock,
}: {
	command: AtomFinalizeCommand;
	lock: WorkerLock;
}): FinalizeCommand => ({
	schemaVersion: 1,
	type: "finalize",
	requestId: command.requestId,
	commandId: command.commandId,
	occurredAt: command.occurredAt,
	identity: {
		...command.identity,
		customerId: lock.customer_id,
		entityId: lock.entity_id,
	},
	org: command.org,
	lock,
	internalFeatureId: command.internalFeatureId,
	finalValue: command.finalValue,
	properties: command.properties,
});

/** A track of nothing carrying the finalize's source: its own record, so the Atom's seq lands whatever the settle did. */
const seqOnlyTrackOf = ({
	command,
}: {
	command: AtomFinalizeCommand;
}): TrackCommand => ({
	schemaVersion: 1,
	type: "track",
	requestId: command.requestId,
	commandId: `${command.commandId}:seq`,
	occurredAt: command.occurredAt,
	identity: command.identity,
	org: command.org,
	featureId: command.featureId,
	internalFeatureId: command.internalFeatureId,
	value: 0,
	overageBehavior: "cap",
	properties: null,
	usageEvent: null,
	source: command.source,
});

/** Settles the held row as a finalize; a row that is not the lock named, or a settle the writer refuses or already has, settles nothing. */
async function settleOrRefuse({
	ctx,
	command,
	lock,
}: {
	ctx: ConsumeContext;
	command: AtomFinalizeCommand;
	lock: WorkerLock;
}): Promise<QueuedCommand | null> {
	if (!namesHeldLock({ command, lock })) {
		ctx.logger?.warn(
			"Queued Atom finalize refused: the held lock is not the one it names",
			{
				commandId: command.commandId,
				customerId: command.identity.customerId,
				lockId: command.lockId,
			},
		);
		return null;
	}
	try {
		const decided = await ctx.processor.decideFinalize({
			command: finalizeCommandOf({ command, lock }),
		});
		return { decided };
	} catch (cause) {
		if (classifyQueuedFailure({ cause }) === "transient") throw cause;
		ctx.logger?.warn(
			"Queued Atom finalize settled nothing; its seq still lands",
			{
				commandId: command.commandId,
				customerId: command.identity.customerId,
				error: cause,
			},
		);
		return null;
	}
}

/** One record, two decides in log order: it settles once both have committed, and answers with the settle's verdict. */
const settledThenSeq = ({
	settled,
	seq,
}: {
	settled: QueuedCommand | null;
	seq: QueuedCommand | null;
}): QueuedCommand | null => {
	if (!settled || !seq) return settled ?? seq;
	return {
		decided: {
			waitForCommit: async () => {
				const [verdict] = await Promise.all([
					settled.decided.waitForCommit(),
					seq.decided.waitForCommit(),
				]);
				return verdict;
			},
		},
	};
};

/** An Atom's finalize: Autumn settles its own row for the lock named, if it still holds one, then lands the Atom's seq. */
export async function consumeAtomFinalize({
	ctx,
	command,
	lockRows,
}: {
	ctx: ConsumeContext;
	command: AtomFinalizeCommand;
	/** The open lock rows the batch's one read found for its finalizes. */
	lockRows: readonly WorkerLock[];
}): Promise<QueuedCommand | null> {
	const pending = ctx.processor.pendingLockRow(command);
	const lock = resolveLockRow({ pending, rows: lockRows, command });
	const settled = lock ? await settleOrRefuse({ ctx, command, lock }) : null;
	const seq = await landAtomSeqOnly({
		ctx,
		command: seqOnlyTrackOf({ command }),
	});
	return settledThenSeq({ settled, seq });
}
