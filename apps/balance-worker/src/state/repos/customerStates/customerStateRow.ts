import {
	meteringPartitionKeyOf,
	parseCustomerMeteringState,
} from "@autumn/balance-engine";
import { CorruptBalanceStateError } from "../../sqliteBalanceStateErrors.js";
import type { StoredMeteringState } from "../../types/storedMeteringState.js";

export type StateRow = {
	partitionKey: string;
	topic: string;
	partition: bigint;
	initializationId: string;
	initializationFingerprint: string;
	revision: bigint;
	stateJson: string;
};

export const storedStateFromRow = ({
	row,
}: {
	row: StateRow;
}): StoredMeteringState => {
	const state = parseCustomerMeteringState({
		input: JSON.parse(row.stateJson),
	});
	if (
		BigInt(state.revision) !== row.revision ||
		meteringPartitionKeyOf({ identity: state.identity }) !== row.partitionKey ||
		row.topic.trim().length === 0 ||
		row.partition < 0n ||
		row.partition > BigInt(Number.MAX_SAFE_INTEGER) ||
		row.initializationId.length === 0 ||
		row.initializationFingerprint.length === 0
	) {
		throw new CorruptBalanceStateError({ partitionKey: row.partitionKey });
	}
	return {
		topic: row.topic,
		partition: Number(row.partition),
		initializationId: row.initializationId,
		initializationFingerprint: row.initializationFingerprint,
		state,
	};
};
