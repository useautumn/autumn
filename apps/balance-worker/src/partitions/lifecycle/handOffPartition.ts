import { failPartitionRetirement } from "../partitionService.js";
import { reportPartitionError } from "../reportPartitionError.js";
import type {
	PartitionEntry,
	PartitionsContext,
	PartitionsState,
} from "../types/partitionState.js";
import type { PartitionFailure } from "../types/partitions.js";
import { PartitionHandoffCancelledError } from "./partitionLifecycleErrors.js";
import { startPartitions } from "./startPartitions.js";
import { closePartitionAdmission } from "./stopPartitions.js";

export class HandoffReadyTimeoutError extends Error {
	constructor({ partition }: { partition: number }) {
		super(`No successor announced ready for partition ${partition}`);
		this.name = "HandoffReadyTimeoutError";
	}
}

export function beginPartitionHandoffs({
	ctx,
	state,
}: {
	ctx: PartitionsContext;
	state: PartitionsState;
}): PartitionEntry[] {
	const handingOff: PartitionEntry[] = [];
	for (const entry of [...state.entries.values()]) {
		if (!entry.startupSettled || !entry.claimed || entry.withdrawn) continue;
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
	successor?: string;
}): Promise<void> {
	const { partition } = entry;
	const cancel = entry.handoffAbort.signal;
	const successor =
		announced ?? (await awaitSuccessor({ ctx, state, entry, cancel }));
	if (cancel.aborted) return;
	entry.withdrawn = true;
	state.directory.withdraw({ partition });
	if (announced) pauseHandedOffCommands({ ctx, partition });
	state.retiringEntries.set(partition, entry);
	const settlement = Promise.withResolvers<void>();
	state.handoffSettlements.set(partition, settlement.promise);
	closePartitionAdmission({ entry });
	try {
		if (successor) void announceDraining({ ctx, entry, successor });
		const drained = await entry.drain;
		if (!drained?.ok) return;
		if (successor) {
			const { routeEpoch } = await entry.publication.claim({
				endpoint: successor,
			});
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

async function awaitSuccessor({
	ctx,
	state,
	entry,
	cancel,
}: {
	ctx: PartitionsContext;
	state: PartitionsState;
	entry: PartitionEntry;
	cancel: AbortSignal;
}): Promise<string | null> {
	const timeout = new AbortController();
	const signal = AbortSignal.any([cancel, timeout.signal]);
	let waitMs = ctx.config.handoffReadyTimeoutMs;
	function expire(): void {
		if (state.status === "running") {
			timer = setTimeout(expire, waitMs);
			return;
		}
		timeout.abort(new HandoffReadyTimeoutError({ partition: entry.partition }));
	}
	let timer = setTimeout(expire, waitMs);
	function holdForPreparation(): void {
		if (timeout.signal.aborted) return;
		clearTimeout(timer);
		waitMs = ctx.config.handoffDrainCapMs;
		timer = setTimeout(expire, waitMs);
	}
	function giveUpOnFailure(failure: PartitionFailure): void {
		timeout.abort(failure.cause);
	}
	const unsubscribeFailure =
		entry.runtime.subscribeUnavailable(giveUpOnFailure);
	try {
		const preparing = entry.publication.awaitPreparing({ signal });
		void preparing.then(holdForPreparation, noop);
		if (entry.publication.readActivePreparation()) holdForPreparation();
		const { endpoint } = await entry.publication.awaitReady({ signal });
		return endpoint;
	} catch (cause) {
		if (!(cause instanceof HandoffReadyTimeoutError) && !cancel.aborted)
			reportPartitionError({ ctx, cause });
		return null;
	} finally {
		unsubscribeFailure();
		clearTimeout(timer);
		timeout.abort(new HandoffReadyTimeoutError({ partition: entry.partition }));
	}
}
