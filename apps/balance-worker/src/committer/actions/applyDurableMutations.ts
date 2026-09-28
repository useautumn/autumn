import {
	PartitionProgressNotFoundError,
	UnexpectedKafkaOffsetError,
} from "../../state/stateStoreErrors.js";
import type {
	DurableMutationApplyResult,
	DurableMutationRecord,
} from "../../state/types/durableMutation.js";
import {
	FlushRecordBlockedError,
	FlushRecordFailedError,
} from "../committerErrors.js";
import type { CommitterStateStoreContext } from "../types/committerStateStoreContext.js";

/**
 * Records below the bookmark are already in Postgres; the rest must climb from it.
 * Gaps are legal: a transactional producer's commit marker takes an offset of its own.
 */
const splitAtBookmark = ({
	records,
	expectedOffset,
}: {
	records: readonly DurableMutationRecord[];
	expectedOffset: bigint;
}): { alreadyApplied: number; pending: DurableMutationRecord[] } => {
	let alreadyApplied = 0;
	const pending: DurableMutationRecord[] = [];
	let floor = expectedOffset;
	for (const record of records) {
		if (record.position.offset < expectedOffset) {
			alreadyApplied++;
			continue;
		}
		if (record.position.offset < floor) {
			throw new UnexpectedKafkaOffsetError({
				...record.position,
				expectedOffset: floor,
				receivedOffset: record.position.offset,
			});
		}
		pending.push(record);
		floor = record.position.offset + 1n;
	}
	return { alreadyApplied, pending };
};

export const applyDurableMutations = async ({
	ctx,
	records,
}: {
	ctx: CommitterStateStoreContext;
	records: readonly DurableMutationRecord[];
}): Promise<DurableMutationApplyResult[]> => {
	const first = records[0];
	if (!first) return [];
	const { topic, partition } = first.position;
	const expectedOffset = ctx.progress.readNextOffset({ topic, partition });
	if (expectedOffset === null) {
		throw new PartitionProgressNotFoundError({ topic, partition });
	}

	const { alreadyApplied, pending } = splitAtBookmark({
		records,
		expectedOffset,
	});
	const results: DurableMutationApplyResult[] = Array.from(
		{ length: alreadyApplied },
		() => ({ kind: "position_already_applied", nextOffset: expectedOffset }),
	);
	if (pending.length === 0) return results;

	const outcome = await ctx.committer.apply({
		topic,
		partition,
		expectedOffset,
		records: pending,
	});
	ctx.progress.setNextOffset({
		topic,
		partition,
		nextOffset: outcome.nextOffset,
	});
	if (outcome.commandNextOffset !== undefined)
		ctx.progress.setCommandNextOffset({
			topic,
			partition,
			commandNextOffset: outcome.commandNextOffset,
		});
	if (outcome.ownerFence !== undefined)
		ctx.progress.setOwnerFence({ topic, partition, fence: outcome.ownerFence });
	// Everything before the failed record is in Postgres and the bookmark says so; the rest waits for recovery.
	const failedId = outcome.failure?.record.mutation.id ?? null;
	const rejectionById = new Map(
		(outcome.rejections ?? []).map((rejection) => [
			rejection.record.mutation.id,
			rejection.cause,
		]),
	);
	for (const record of pending) {
		const rejectedFor = rejectionById.get(record.mutation.id);
		if (rejectedFor) {
			results.push({
				kind: "rejected",
				mutation: record.mutation,
				cause: rejectedFor,
			});
			continue;
		}
		if (record.position.offset < outcome.nextOffset) {
			results.push({
				kind: "applied",
				mutation: record.mutation,
				nextOffset: record.position.offset + 1n,
			});
			continue;
		}
		const cause =
			outcome.failure && record.mutation.id === failedId
				? new FlushRecordFailedError({
						mutationId: failedId,
						cause: outcome.failure.cause,
					})
				: new FlushRecordBlockedError({
						mutationId: record.mutation.id,
						blockedBy: failedId ?? "an earlier record",
					});
		results.push({ kind: "failed", mutation: record.mutation, cause });
	}
	return results;
};
