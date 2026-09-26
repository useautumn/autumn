import { failPartitionRetirement } from "../partitionService.js";
import { reportPartitionError } from "../reportPartitionError.js";
import type {
	PartitionEntry,
	PartitionsContext,
	PartitionsState,
} from "../types/partitionState.js";
import { closePartitionAdmission } from "./stopPartitions.js";

export class HandoffReadyTimeoutError extends Error {
	constructor({ partition }: { partition: number }) {
		super(`No successor announced ready for partition ${partition}`);
		this.name = "HandoffReadyTimeoutError";
	}
}

/** Serving entries keep serving while a successor prepares; the rest retire the way they always did. */
export function beginPartitionHandoffs({
	ctx,
	state,
}: {
	ctx: PartitionsContext;
	state: PartitionsState;
}): PartitionEntry[] {
	const handingOff: PartitionEntry[] = [];
	for (const entry of [...state.entries.values()]) {
		if (!entry.startupSettled || !entry.claimed) continue;
		state.entries.delete(entry.partition);
		state.handingOff.set(entry.partition, entry);
		entry.retirement = handOffPartition({ ctx, state, entry });
		void watchHandoffRetirement({ ctx, state, retirement: entry.retirement });
		handingOff.push(entry);
	}
	return handingOff;
}

async function watchHandoffRetirement({
	ctx,
	state,
	retirement,
}: {
	ctx: PartitionsContext;
	state: PartitionsState;
	retirement: Promise<void>;
}): Promise<void> {
	try {
		await retirement;
	} catch (cause) {
		if (state.status === "running")
			failPartitionRetirement({ ctx, state, cause });
	}
}

/** Back into service: the roster handed the partition to this worker again before it stopped serving. */
export function cancelPartitionHandoff({
	state,
	entry,
}: {
	state: PartitionsState;
	entry: PartitionEntry;
}): boolean {
	if (entry.withdrawn) return false;
	entry.handoffAbort.abort(new Error("Partition handoff cancelled"));
	entry.handoffAbort = new AbortController();
	entry.retirement = null;
	state.handingOff.delete(entry.partition);
	state.entries.set(entry.partition, entry);
	return true;
}

async function handOffPartition({
	ctx,
	state,
	entry,
}: {
	ctx: PartitionsContext;
	state: PartitionsState;
	entry: PartitionEntry;
}): Promise<void> {
	const { partition } = entry;
	const cancel = entry.handoffAbort.signal;
	const successor = await awaitSuccessor({ ctx, entry, cancel });
	if (cancel.aborted) return;
	entry.withdrawn = true;
	state.directory.withdraw({ partition });
	state.retiringEntries.set(partition, entry);
	const settlement = Promise.withResolvers<void>();
	state.handoffSettlements.set(partition, settlement.promise);
	closePartitionAdmission({ entry });
	try {
		// Tells the successor this worker is alive and working, so its claim timeout only covers silence.
		// Not awaited: a slow send must not hold the drain past that timeout.
		if (successor) void announceDraining({ ctx, entry, successor });
		const drained = await entry.drain;
		if (!drained?.ok) return;
		// The claim is the successor's signal to fence: it must follow the drain, never precede it.
		if (successor) await entry.publication.claim({ endpoint: successor });
		else if (entry.claimAttempted) await entry.publication.release();
	} catch (cause) {
		entry.publicationFailed = true;
		reportPartitionError({ ctx, cause });
	} finally {
		settlement.resolve();
		if (state.handoffSettlements.get(partition) === settlement.promise)
			state.handoffSettlements.delete(partition);
		try {
			await entry.runtime.stop();
		} finally {
			ctx.served?.release({ partition });
			try {
				await entry.runtime.waitForQuiescence();
			} finally {
				if (state.handingOff.get(partition) === entry)
					state.handingOff.delete(partition);
			}
		}
	}
}

/** Best effort: without it the successor falls back to the claim timeout, as before. */
async function announceDraining({
	ctx,
	entry,
	successor,
}: {
	ctx: PartitionsContext;
	entry: PartitionEntry;
	successor: string;
}): Promise<void> {
	try {
		await entry.publication.announceDraining({ successor });
	} catch (cause) {
		reportPartitionError({ ctx, cause });
	}
}

/** The successor's endpoint, or null when none announced in time and the old release path applies. */
async function awaitSuccessor({
	ctx,
	entry,
	cancel,
}: {
	ctx: PartitionsContext;
	entry: PartitionEntry;
	cancel: AbortSignal;
}): Promise<string | null> {
	const timeout = new AbortController();
	function expire(): void {
		timeout.abort(new HandoffReadyTimeoutError({ partition: entry.partition }));
	}
	const timer = setTimeout(expire, ctx.config.handoffReadyTimeoutMs);
	try {
		const { endpoint } = await entry.publication.awaitReady({
			signal: AbortSignal.any([cancel, timeout.signal]),
		});
		return endpoint;
	} catch (cause) {
		if (!(cause instanceof HandoffReadyTimeoutError) && !cancel.aborted)
			reportPartitionError({ ctx, cause });
		return null;
	} finally {
		clearTimeout(timer);
	}
}
