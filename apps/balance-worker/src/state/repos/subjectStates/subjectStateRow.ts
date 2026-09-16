import {
	meteringPartitionKeyOf,
	parseCustomerState,
} from "@autumn/balance-engine";
import { CorruptBalanceStateError } from "../../stateStoreErrors.js";
import type { StoredSubjectState } from "../../types/storedSubjectState.js";

export type SubjectStateRow = {
	partitionKey: string;
	topic: string;
	partition: bigint;
	revision: bigint;
	stateJson: string;
};

export const storedSubjectStateFromRow = ({
	row,
}: {
	row: SubjectStateRow;
}): StoredSubjectState => {
	const state = parseCustomerState({ input: JSON.parse(row.stateJson) });
	if (
		BigInt(state.revision) !== row.revision ||
		meteringPartitionKeyOf({ identity: state.identity }) !== row.partitionKey ||
		row.topic.trim().length === 0 ||
		row.partition < 0n ||
		row.partition > BigInt(Number.MAX_SAFE_INTEGER)
	) {
		throw new CorruptBalanceStateError({ partitionKey: row.partitionKey });
	}
	return { topic: row.topic, partition: Number(row.partition), state };
};
