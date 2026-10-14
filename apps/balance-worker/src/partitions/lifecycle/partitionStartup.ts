import {
	ownedPartitionFailureReasonOf,
	ownedPartitionHealthOf,
} from "../../health/ownedPartitionHealth.js";
import { isCurrentAllocation } from "../allocation/partitionAllocation.js";
import {
	onPartitionUnavailable,
	respondToPartitionFailure,
} from "../health/partitionHealthChecks.js";
import { reportPartitionError } from "../reportPartitionError.js";
import type {
	AllocationScope,
	PartitionEntry,
	PartitionScope,
	PartitionsContext,
	PartitionsState,
} from "../types/partitionState.js";
import type { PartitionFailure } from "../types/partitions.js";
import { watchForSuccessor } from "./handOffPartition.js";
import { clearPartitionRetry } from "./retryPartition.js";

async function resumeCommands({
	ctx,
	partition,
}: {
	ctx: AllocationScope["ctx"];
	partition: number;
}): Promise<void> {
	if (!ctx.config.commandTopic) return;
	await ctx.consumer.resume({
		topic: ctx.config.commandTopic,
		partitions: [partition],
	});
}

export function createPartitionEntries({
	ctx,
	state,
	allocationGeneration,
	partitions,
}: AllocationScope & {
	partitions: number[];
}): PartitionEntry[] {
	const { topic } = ctx.config;
	const entries: PartitionEntry[] = [];
	for (const partition of partitions) {
		try {
			clearPartitionRetry({ state, partition });
			state.terminalHealthByPartition.delete(partition);
			state.retiringEntries.delete(partition);
			const resources = ctx.createRuntime({ topic, partition });
			const entry: PartitionEntry = {
				partition,
				...resources,
				startupSettled: false,
				startup: null,
				claimAttempted: false,
				claimed: false,
				publicationFailed: false,
				unsubscribeUnavailable: null,
				handoffAbort: new AbortController(),
				withdrawn: false,
				retirement: null,
				drain: null,
			};
			entries.push(entry);
			state.entries.set(partition, entry);
			ctx.served?.claim({ partition });
			subscribeEntryUnavailable({ ctx, state, entry, allocationGeneration });
		} catch (cause) {
			reportPartitionError({ ctx, cause });
			const progress = ctx.progress.readProgress({ topic, partition });
			respondToPartitionFailure({
				ctx,
				state,
				partition,
				cause,
				allocationGeneration,
				health: ownedPartitionHealthOf({
					topic,
					partition,
					status: "recovery_required",
					...progress,
					failureReason: ownedPartitionFailureReasonOf({ cause }),
				}),
			});
		}
	}
	return entries;
}

export function subscribeEntryUnavailable({
	ctx,
	state,
	entry,
	allocationGeneration,
}: PartitionScope): void {
	function onUnavailable(failure: PartitionFailure): void {
		onPartitionUnavailable({
			ctx,
			state,
			entry,
			allocationGeneration,
			cause: failure.cause,
		});
	}
	entry.unsubscribeUnavailable?.();
	entry.unsubscribeUnavailable =
		entry.runtime.subscribeUnavailable(onUnavailable);
}

async function prepareInTurn({
	ctx,
	entry,
}: {
	ctx: PartitionsContext;
	entry: PartitionEntry;
}): Promise<void> {
	const release = await ctx.acquirePreparation?.({
		signal: entry.handoffAbort.signal,
	});
	try {
		await entry.runtime.prepare();
	} finally {
		release?.();
	}
}

export async function startPartition({
	ctx,
	state,
	entry,
	allocationGeneration,
}: PartitionScope): Promise<void> {
	const { partition } = entry;
	function isStillStarting(): boolean {
		return (
			isCurrentAllocation({ state, allocationGeneration }) &&
			state.entries.get(partition) === entry
		);
	}
	try {
		void announcePreparing({ ctx, entry });
		await prepareInTurn({ ctx, entry });
		if (!isStillStarting()) return;
		await ctx.awaitReadyAnnouncement?.({
			partition,
			signal: entry.handoffAbort.signal,
		});
		if (!isStillStarting()) return;

		const handedOff = await awaitHandoffClaim({ ctx, entry });
		if (!isStillStarting()) return;
		watchForSuccessor({ ctx, state, entry });

		const activation = entry.runtime.activate();
		try {
			if (handedOff) admitPartition({ state, entry, routeEpoch: handedOff });
			await activation;
		} catch (cause) {
			state.directory.withdraw({ partition });
			throw cause;
		}
		if (!isStillStarting()) return;
		const health = entry.runtime.getHealth();
		if (health.status !== "ready" || health.failureReason !== null) return;

		if (!handedOff) {
			let routeEpoch: string;
			try {
				entry.claimAttempted = true;
				({ routeEpoch } = await entry.publication.claim());
				entry.claimed = true;
			} catch (cause) {
				entry.publicationFailed = true;
				throw cause;
			}
			if (!isStillStarting()) return;
			await entry.runtime.fence?.();
			if (!isStillStarting()) return;
			admitPartition({ state, entry, routeEpoch });
		}
		await resumeCommands({ ctx, partition });
	} finally {
		entry.startupSettled = true;
	}
}

async function announcePreparing({
	ctx,
	entry,
}: {
	ctx: AllocationScope["ctx"];
	entry: PartitionEntry;
}): Promise<void> {
	try {
		await entry.publication.announcePreparing();
	} catch (cause) {
		reportPartitionError({ ctx, cause });
	}
}

function admitPartition({
	state,
	entry,
	routeEpoch,
}: {
	state: PartitionsState;
	entry: PartitionEntry;
	routeEpoch: string;
}): void {
	state.handoffSuccessors.delete(entry.partition);
	state.directory.admit({
		partition: entry.partition,
		routeEpoch,
		runtime: entry.runtime,
	});
}

async function awaitHandoffClaim({
	ctx,
	entry,
}: {
	ctx: AllocationScope["ctx"];
	entry: PartitionEntry;
}): Promise<string | null> {
	const timeout = new AbortController();
	function expire(): void {
		timeout.abort(new Error("Handoff claim timed out"));
	}
	const signal = AbortSignal.any([entry.handoffAbort.signal, timeout.signal]);
	const claim = entry.publication.awaitClaim({ signal });
	const draining = entry.publication.awaitDraining({ signal });
	const foreignClaim = entry.publication.awaitForeignClaim({ signal });
	void Promise.allSettled([claim, draining, foreignClaim]);
	let timer = setTimeout(expire, ctx.config.handoffClaimTimeoutMs);
	function rearm({ afterMs }: { afterMs: number }): void {
		if (timeout.signal.aborted) return;
		clearTimeout(timer);
		timer = setTimeout(expire, afterMs);
	}
	function holdForDrain(): void {
		rearm({ afterMs: ctx.config.handoffDrainCapMs });
	}
	function restartSilence(): void {
		rearm({ afterMs: ctx.config.handoffClaimTimeoutMs });
	}
	if (entry.publication.readActiveDrain()) holdForDrain();
	void draining.then(holdForDrain, noop);
	void foreignClaim.then(restartSilence, noop);
	try {
		await entry.publication.announceReady();
		const { routeEpoch } = await claim;
		entry.claimAttempted = true;
		entry.claimed = true;
		return routeEpoch;
	} catch (cause) {
		if (entry.handoffAbort.signal.aborted) throw cause;
		if (!timeout.signal.aborted) reportPartitionError({ ctx, cause });
		return null;
	} finally {
		clearTimeout(timer);
		timeout.abort(new Error("Handoff claim wait settled"));
	}
}

function noop(): void {}

export function reportPartitionStartupFailure({
	ctx,
	state,
	entry,
	cause,
	allocationGeneration,
}: PartitionScope & { cause: unknown }): void {
	reportPartitionError({ ctx, cause });
	respondToPartitionFailure({
		ctx,
		state,
		partition: entry.partition,
		entry,
		cause,
		health: entry.runtime.getHealth(),
		allocationGeneration,
	});
}
