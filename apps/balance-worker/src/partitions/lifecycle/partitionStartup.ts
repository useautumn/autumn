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
	PartitionsState,
} from "../types/partitionState.js";
import type { PartitionFailure } from "../types/partitions.js";
import { clearPartitionRetry } from "./retryPartition.js";

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
				claimed: false,
				publicationFailed: false,
				unsubscribeUnavailable: null,
				retirement: null,
				drain: null,
			};
			entries.push(entry);
			state.entries.set(partition, entry);
			function onUnavailable(failure: PartitionFailure): void {
				onPartitionUnavailable({
					ctx,
					state,
					entry,
					allocationGeneration,
					cause: failure.cause,
				});
			}
			entry.unsubscribeUnavailable =
				entry.runtime.subscribeUnavailable(onUnavailable);
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

export async function startPartition({
	state,
	entry,
	allocationGeneration,
}: {
	state: PartitionsState;
	entry: PartitionEntry;
	allocationGeneration: number;
}): Promise<void> {
	try {
		await entry.runtime.start();
		if (
			!isCurrentAllocation({ state, allocationGeneration }) ||
			state.entries.get(entry.partition) !== entry
		)
			return;

		const health = entry.runtime.getHealth();
		if (health.status !== "ready" || health.failureReason !== null) return;

		let routeEpoch: string;
		try {
			({ routeEpoch } = await entry.publication.claim());
			entry.claimed = true;
		} catch (cause) {
			entry.publicationFailed = true;
			throw cause;
		}

		if (
			!isCurrentAllocation({ state, allocationGeneration }) ||
			state.entries.get(entry.partition) !== entry
		)
			return;

		state.directory.admit({
			partition: entry.partition,
			routeEpoch,
			runtime: entry.runtime,
		});
	} finally {
		entry.startupSettled = true;
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
