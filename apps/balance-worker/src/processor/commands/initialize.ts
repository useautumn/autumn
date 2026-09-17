import type {
	CustomerMeteringState,
	StateInitializedEvent,
} from "@autumn/balance-engine";
import type { PartitionWriter } from "../writer/types/partitionWriter.js";

export type InitializationDecision =
	| { kind: "initialized" | "duplicate"; state: CustomerMeteringState }
	| { kind: "already_initialized" };

/** Initialize, end to end: commit a revision-zero baseline unless the customer already has state. */
export async function initialize({
	writer,
	initialization,
}: {
	writer: PartitionWriter;
	initialization: StateInitializedEvent;
}): Promise<InitializationDecision> {
	const result = await writer.submitInitialization({ initialization });
	if (result.kind === "already_initialized") return result;
	if (result.outcome.type !== "state_initialized") {
		throw new Error("Initialization committed a non-initialization record");
	}
	return {
		kind: result.kind === "new" ? "initialized" : "duplicate",
		state: result.outcome.state,
	};
}
