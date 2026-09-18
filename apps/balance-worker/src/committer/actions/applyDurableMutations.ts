import {
	PartitionProgressNotFoundError,
	UnexpectedKafkaOffsetError,
} from "../../state/stateStoreErrors.js";
import type {
	DurableMutationApplyResult,
	DurableMutationRecord,
} from "../../state/types/durableMutation.js";
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

	const { nextOffset } = await ctx.committer.apply({
		topic,
		partition,
		expectedOffset,
		records: pending,
	});
	ctx.progress.setNextOffset({ topic, partition, nextOffset });
	for (const record of pending) {
		results.push({
			kind: "applied",
			mutation: record.mutation,
			nextOffset: record.position.offset + 1n,
		});
	}
	return results;
};
