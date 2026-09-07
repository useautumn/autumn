import { reportPartitionError } from "../reportPartitionError.js";
import type {
	PartitionCleanupResult,
	PartitionEntry,
	PartitionsContext,
	PartitionsState,
} from "../types/partitionState.js";
import type { PartitionRevocation } from "../types/partitions.js";

export function detachPartitions({
	state,
	revocation,
	failure,
}: {
	state: PartitionsState;
	revocation?: PartitionRevocation;
	failure?: { cause: unknown };
}): PartitionEntry[] {
	const detached = [...state.entries.values()];
	state.entries.clear();
	for (const entry of detached) {
		state.directory.withdraw({ partition: entry.partition });
		if (failure) entry.publicationFailed = true;
		closePartitionAdmission({ entry });
		if (failure) entry.markUnavailable({ cause: failure.cause });
		else if (revocation)
			entry.markUnavailable({
				cause: revocation.causeForPartition({ partition: entry.partition }),
			});
		state.retiringEntries.set(entry.partition, entry);
	}
	return detached;
}

export async function stopPartitions({
	ctx,
	entriesToStop,
}: {
	ctx: PartitionsContext;
	entriesToStop: PartitionEntry[];
}): Promise<void> {
	const retirements: Promise<void>[] = [];
	for (const entry of entriesToStop)
		retirements.push(retirePartition({ ctx, entry }));
	const results = await Promise.allSettled(retirements);
	const errors: unknown[] = [];
	for (const result of results) {
		if (result.status !== "rejected") continue;
		errors.push(result.reason);
	}
	if (errors.length)
		throw new AggregateError(
			errors,
			"Partition retirement did not settle safely",
		);
}

export async function withdrawPartitions({
	ctx,
	previousLifecycle,
	entriesToStop,
}: {
	ctx: PartitionsContext;
	previousLifecycle: Promise<void>;
	entriesToStop: PartitionEntry[];
}): Promise<void> {
	const results = await Promise.allSettled([
		previousLifecycle,
		stopPartitions({ ctx, entriesToStop }),
	]);
	for (const result of results)
		if (result.status === "rejected") throw result.reason;
}

function closePartitionAdmission({ entry }: { entry: PartitionEntry }): void {
	entry.unsubscribeUnavailable?.();
	entry.unsubscribeUnavailable = null;
	entry.drain ??= drainPartition({ entry });
}

async function drainPartition({
	entry,
}: {
	entry: PartitionEntry;
}): Promise<PartitionCleanupResult> {
	try {
		await entry.runtime.drain();
		return { ok: true };
	} catch (cause) {
		return { ok: false, cause };
	}
}

function retirePartition({
	ctx,
	entry,
}: {
	ctx: PartitionsContext;
	entry: PartitionEntry;
}): Promise<void> {
	if (entry.retirement) return entry.retirement;
	closePartitionAdmission({ entry });
	entry.retirement = completePartitionRetirement({ ctx, entry });
	return entry.retirement;
}

async function completePartitionRetirement({
	ctx,
	entry,
}: {
	ctx: PartitionsContext;
	entry: PartitionEntry;
}): Promise<void> {
	try {
		// A late claim must settle before cleanup uses or disconnects its producer.
		await entry.startup;
	} catch {
		// Startup failure is reported separately; retirement must still finish.
	}
	const drained = await entry.drain;
	try {
		if (drained?.ok && entry.claimed && !entry.publicationFailed)
			await entry.publication.release();
	} catch (cause) {
		entry.publicationFailed = true;
		reportPartitionError({ ctx, cause });
	} finally {
		try {
			await entry.runtime.stop();
		} finally {
			await entry.runtime.waitForQuiescence();
		}
	}
}
