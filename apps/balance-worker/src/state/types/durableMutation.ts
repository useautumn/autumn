import type { MutationRecord, SubjectState } from "@autumn/balance-engine";
import type { KafkaRecordPosition } from "./kafkaRecordPosition.js";

export type DurableMutationRecord = {
	position: KafkaRecordPosition;
	mutation: MutationRecord;
};

export type DurableMutationApplyResult =
	| {
			kind: "applied" | "duplicate";
			mutation: MutationRecord;
			nextOffset: bigint;
	  }
	| { kind: "position_already_applied"; nextOffset: bigint }
	/** On the log but not in the store: the record itself would not land, or one before it would not. */
	| { kind: "failed"; mutation: MutationRecord; cause: unknown }
	/** Refused for a business reason, a lock id already taken: its changes never landed and nothing waits behind it. */
	| { kind: "rejected"; mutation: MutationRecord; cause: Error };

/** The SQLite store also hands back the state it wrote; tests and checkpoints read it. */
export type SqliteDurableMutationApplyResult =
	| {
			kind: "applied" | "duplicate";
			state: SubjectState;
			mutation: MutationRecord;
			nextOffset: bigint;
	  }
	| { kind: "position_already_applied"; nextOffset: bigint };
