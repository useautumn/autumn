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

/** Commands resume only after replay has restored their durable bookmark. */
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

/** prepare → announce ready → named owner by the predecessor (or claim for itself) → activate → admit. */
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
		// Best effort, not awaited: the owner that hears it keeps serving through this preparation
		// instead of releasing at its handoff timeout; without it the old path still applies.
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
		// Listening from here on: a successor from another fleet may announce before this worker has even admitted.
		watchForSuccessor({ ctx, state, entry });

		const activation = entry.runtime.activate();
		try {
			// Named owner already: requests routed here wait at the gate while the runtime fences.
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
			// The claim names this worker; the marker written under its epoch is what fences the last one.
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
	// Admitted here again: whoever it was handed to before is no longer where to send callers.
	state.handoffSuccessors.delete(entry.partition);
	state.directory.admit({
		partition: entry.partition,
		routeEpoch,
		runtime: entry.runtime,
	});
}

/** The route epoch of the predecessor's `claimed` naming this worker, or null when none came in time. */
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
	// Listen before announcing: the claim can only follow the announcement, so nothing is missed.
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
	// The timeout covers silence: a predecessor that says it is draining is alive and
	// gets the longer cap, so its committing tracks are not fenced from under it.
	function holdForDrain(): void {
		rearm({ afterMs: ctx.config.handoffDrainCapMs });
	}
	// The owner handed to someone else (the roster moved this partition mid-drain). That
	// worker either hands on to this one shortly or was already retired; silence decides.
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
