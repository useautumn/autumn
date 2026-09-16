import type {
	CustomerState,
	CustomerStateMutation,
} from "@autumn/balance-engine";
import type { KafkaRecordPosition } from "./kafkaRecordPosition.js";

export type DurableMutationRecord = {
	position: KafkaRecordPosition;
	mutation: CustomerStateMutation;
};

export type DurableMutationApplyResult =
	| {
			kind: "applied" | "duplicate";
			state: CustomerState;
			mutation: CustomerStateMutation;
			nextOffset: bigint;
	  }
	| { kind: "position_already_applied"; nextOffset: bigint };
