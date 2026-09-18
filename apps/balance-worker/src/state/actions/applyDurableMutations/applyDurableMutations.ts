import { parseMutationRecord } from "@autumn/balance-engine";
import {
	assertOffset,
	assertPartition,
	assertTopic,
} from "../../assertKafkaPosition.js";
import type {
	DurableMutationRecord,
	SqliteDurableMutationApplyResult,
} from "../../types/durableMutation.js";
import type { StateStoreContext } from "../../types/stateStoreContext.js";
import { applyRecord } from "./applyRecord.js";

/** Re-parsed through JSON so an in-memory mutation and a replayed one persist identically. */
const parsePersistedMutation = ({
	record,
}: {
	record: DurableMutationRecord;
}): DurableMutationRecord => ({
	position: record.position,
	mutation: parseMutationRecord({
		input: JSON.parse(JSON.stringify(record.mutation)),
	}),
});

/** Applies a committed batch in one transaction, in log order. */
export const applyDurableMutations = ({
	ctx,
	records,
}: {
	ctx: StateStoreContext;
	records: readonly DurableMutationRecord[];
}): SqliteDurableMutationApplyResult[] => {
	const parsedRecords: DurableMutationRecord[] = [];
	for (const record of records) {
		assertTopic({ topic: record.position.topic });
		assertPartition({ partition: record.position.partition });
		assertOffset({ offset: record.position.offset });
		parsedRecords.push(parsePersistedMutation({ record }));
	}
	if (parsedRecords.length === 0) return [];

	return ctx.sqliteDb
		.transaction(() =>
			parsedRecords.map(({ position, mutation }) =>
				applyRecord({ ctx, position, mutation }),
			),
		)
		.immediate();
};
