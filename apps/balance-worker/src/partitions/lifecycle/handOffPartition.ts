import { failPartitionRetirement } from "../partitionService.js";
import { reportPartitionError } from "../reportPartitionError.js";
import type {
	PartitionEntry,
	PartitionsContext,
	PartitionsState,
} from "../types/partitionState.js";
import { PartitionHandoffCancelledError } from "./partitionLifecycleErrors.js";
import { startPartitions } from "./startPartitions.js";
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

/** An owner the roster left alone still hands off when another fleet's worker announces `ready` for its partition. */
export function watchForSuccessor({
	ctx,
	state,
	entry,
}: {
	ctx: PartitionsContext;
	state: PartitionsState;
	entry: PartitionEntry;
}): void {
	const signal = entry.handoffAbort.signal;
	async function onReady({ successor }: { successor: string }): Promise<void> {
		try {
			await entry.startup;
		} catch {
			return;
		}
		const stillServing =
			state.status === "running" &&
			state.entries.get(entry.partition) === entry &&
			entry.claimed &&
			!entry.withdrawn;
		if (signal.aborted || !stillServing) return;
		const generation = state.generation;
		state.entries.delete(entry.partition);
		state.handingOff.set(entry.partition, entry);
		entry.retirement = handOffPartition({ ctx, state, entry, successor });
		void watchHandoffRetirement({ ctx, state, retirement: entry.retirement });
		await entry.retirement.catch(noop);
		prepareForReturn({ ctx, state, partition: entry.partition, generation });
	}
	function onReadyRecord({ endpoint }: { endpoint: string }): void {
		void onReady({ successor: endpoint });
	}
	void entry.publication.awaitReady({ signal }).then(onReadyRecord, noop);
}

/** The roster still deals this partition here, so it is prepared again and held at the gate; a reverse
 *  flip brings it back through the normal handoff. Without a gate it would announce at once and take the
 *  partition straight back, so it stays stopped. An allocation change since the handoff owns it instead. */
function prepareForReturn({
	ctx,
	state,
	partition,
	generation,
}: {
	ctx: PartitionsContext;
	state: PartitionsState;
	partition: number;
	generation: number;
}): void {
	if (!ctx.awaitReadyAnnouncement) return;
	if (state.status !== "running" || state.generation !== generation) return;
	if (state.entries.has(partition) || state.handingOff.has(partition)) return;
	void startPartitions({
		ctx,
		state,
		allocationGeneration: generation,
		partitions: [partition],
	}).catch((cause) => reportPartitionError({ ctx, cause }));
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
	entry.handoffAbort.abort(new PartitionHandoffCancelledError());
	entry.handoffAbort = new AbortController();
	entry.retirement = null;
	state.handingOff.delete(entry.partition);
	state.handoffSuccessors.delete(entry.partition);
	state.entries.set(entry.partition, entry);
	return true;
}

async function handOffPartition({
	ctx,
	state,
	entry,
	successor: announced,
}: {
	ctx: PartitionsContext;
	state: PartitionsState;
	entry: PartitionEntry;
	/** Already known when a foreign `ready` started this handoff; a revoke waits for one. */
	successor?: string;
}): Promise<void> {
	const { partition } = entry;
	const cancel = entry.handoffAbort.signal;
	const successor = announced ?? (await awaitSuccessor({ ctx, entry, cancel }));
	if (cancel.aborted) return;
	entry.withdrawn = true;
	state.directory.withdraw({ partition });
	// The roster still assigns this partition here; without a revoke nothing else stops its commands being fetched.
	if (announced) pauseHandedOffCommands({ ctx, partition });
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
		if (successor) {
			const { routeEpoch } = await entry.publication.claim({
				endpoint: successor,
			});
			// A caller that still arrives here is told this route, and skips reading the ownership topic for it.
			state.handoffSuccessors.set(partition, {
				partition,
				endpoint: successor,
				routeEpoch,
			});
		} else if (entry.claimAttempted) await entry.publication.release();
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

function pauseHandedOffCommands({
	ctx,
	partition,
}: {
	ctx: PartitionsContext;
	partition: number;
}): void {
	if (!ctx.config.commandTopic) return;
	try {
		ctx.consumer.pause({
			topic: ctx.config.commandTopic,
			partitions: [partition],
		});
	} catch (cause) {
		reportPartitionError({ ctx, cause });
	}
}

function noop(): void {}

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

/** The successor's endpoint, or null when none announced in time and the old release path applies.
 *  The timeout covers silence: a successor that has said it is preparing is on its way, and this
 *  worker keeps serving for it up to the drain cap rather than releasing a partition that a
 *  grow or rebalance already assigned elsewhere. */
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
	const signal = AbortSignal.any([cancel, timeout.signal]);
	function expire(): void {
		timeout.abort(new HandoffReadyTimeoutError({ partition: entry.partition }));
	}
	let timer = setTimeout(expire, ctx.config.handoffReadyTimeoutMs);
	function holdForPreparation(): void {
		if (timeout.signal.aborted) return;
		clearTimeout(timer);
		timer = setTimeout(expire, ctx.config.handoffDrainCapMs);
	}
	const preparing = entry.publication.awaitPreparing({ signal });
	void preparing.then(holdForPreparation, noop);
	if (entry.publication.readActivePreparation()) holdForPreparation();
	try {
		const { endpoint } = await entry.publication.awaitReady({ signal });
		return endpoint;
	} catch (cause) {
		if (!(cause instanceof HandoffReadyTimeoutError) && !cancel.aborted)
			reportPartitionError({ ctx, cause });
		return null;
	} finally {
		clearTimeout(timer);
		timeout.abort(new HandoffReadyTimeoutError({ partition: entry.partition }));
	}
}
