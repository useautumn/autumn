import {
	type AtomFinalizeCommand,
	atomFinalizeOnLockEntity,
	type WorkerLock,
} from "@autumn/balance-engine";
import type { CommandRecord } from "@autumn/kafka";
import type { PartitionRuntimePort } from "../partitions/types/partitions.js";
import { resolveLockRow } from "./resolveLockRow.js";
import type { ConsumeContext } from "./types/consume.js";
import type { QueuedCommand } from "./types/queuedCommand.js";

/** What a Kafka batch's Atom finalizes need before any applies: the rows of the locks they name, read at once. */
export type AtomFinalizeBatch = { lockRows: WorkerLock[] };

/** One read of the lock rows the batch's Atom finalizes name; a batch with none never reaches the processor. */
export async function prepareAtomFinalizeBatch({
	commands,
	process,
}: {
	commands: CommandRecord[];
	process: PartitionRuntimePort["process"];
}): Promise<AtomFinalizeBatch> {
	const keys = commands.flatMap((command) =>
		command.type === "atomFinalize"
			? [
					{
						orgId: command.identity.orgId,
						env: command.identity.env,
						lockId: command.lockId,
					},
				]
			: [],
	);
	if (keys.length === 0) return { lockRows: [] };
	return {
		lockRows: await process((processor) => processor.readLockRows({ keys })),
	};
}

/** A queued Atom finalize: its lock's row as it stands (decided in this batch, else read with the batch), settled in arrival order. */
export async function consumeAtomFinalize({
	ctx,
	command,
	batch,
}: {
	ctx: Pick<ConsumeContext, "processor">;
	command: AtomFinalizeCommand;
	/** Absent for a record applied outside a batch the handler began: only a pending row can be found. */
	batch?: AtomFinalizeBatch;
}): Promise<QueuedCommand> {
	const lock = resolveLockRow({
		pending: ctx.processor.pendingLockRow(command),
		rows: batch?.lockRows ?? [],
		command,
	});
	const decided = await ctx.processor.decideAtomFinalize({
		command: atomFinalizeOnLockEntity({ command, lock }),
		lock,
	});
	return { decided };
}
