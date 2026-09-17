import type { MutationRecord, SubjectState } from "@autumn/balance-engine";
import type { KafkaRecordPosition } from "./kafkaRecordPosition.js";

export type DurableMutationRecord = {
	position: KafkaRecordPosition;
	mutation: MutationRecord;
};

export type DurableMutationApplyResult =
	| {
			kind: "applied" | "duplicate";
			state: SubjectState;
			mutation: MutationRecord;
			nextOffset: bigint;
	  }
	| { kind: "position_already_applied"; nextOffset: bigint };
