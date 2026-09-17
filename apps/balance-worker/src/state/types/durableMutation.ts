import type {
	SubjectState,
	SubjectStateMutation,
} from "@autumn/balance-engine";
import type { KafkaRecordPosition } from "./kafkaRecordPosition.js";

export type DurableMutationRecord = {
	position: KafkaRecordPosition;
	mutation: SubjectStateMutation;
};

export type DurableMutationApplyResult =
	| {
			kind: "applied" | "duplicate";
			state: SubjectState;
			mutation: SubjectStateMutation;
			nextOffset: bigint;
	  }
	| { kind: "position_already_applied"; nextOffset: bigint };
