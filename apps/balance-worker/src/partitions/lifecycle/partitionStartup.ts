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
	PartitionsState,
} from "../types/partitionState.js";
import type { PartitionFailure } from "../types/partitions.js";
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
		await entry.runtime.prepare();
		if (!isStillStarting()) return;
		await ctx.awaitReadyAnnouncement?.({
			partition,
			signal: entry.handoffAbort.signal,
		});
		if (!isStillStarting()) return;

		const handedOff = await awaitHandoffClaim({ ctx, entry });
		if (!isStillStarting()) return;

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

function admitPartition({
	state,
	entry,
	routeEpoch,
}: {
	state: PartitionsState;
	entry: PartitionEntry;
	routeEpoch: string;
}): void {
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
	void Promise.allSettled([claim]);
	const timer = setTimeout(expire, ctx.config.handoffClaimTimeoutMs);
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

export function reportPartitionStartupFailures({
	ctx,
	state,
	entries,
	results,
	allocationGeneration,
}: AllocationScope & {
	entries: PartitionEntry[];
	results: PromiseSettledResult<void>[];
}): void {
	for (const [index, result] of results.entries()) {
		if (result.status !== "rejected") continue;
		reportPartitionError({ ctx, cause: result.reason });
		const entry = entries[index];
		if (!entry) continue;
		respondToPartitionFailure({
			ctx,
			state,
			partition: entry.partition,
			entry,
			cause: result.reason,
			health: entry.runtime.getHealth(),
			allocationGeneration,
		});
	}
}
