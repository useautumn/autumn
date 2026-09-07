import {
	type InitializationDecision,
	type InitializeCommand,
	parseInitializeCommand,
} from "@autumn/balance-engine";
import type { PartitionWriter } from "../writer/types/partitionWriter.js";

export type { InitializationDecision } from "@autumn/balance-engine";

/** Initialize, end to end: commit a revision-zero baseline unless the customer already has state. */
export async function initialize({
	writer,
	command,
}: {
	writer: PartitionWriter;
	command: InitializeCommand;
}): Promise<InitializationDecision> {
	const parsed = parseInitializeCommand({ input: command });
	const result = await writer.submitInitialization({
		initialization: {
			schemaVersion: 1,
			type: "state_initialized",
			initializationId: parsed.initializationId,
			initializedAt: parsed.occurredAt,
			state: parsed.state,
		},
	});
	if (result.kind === "already_initialized") return result;
	if (result.outcome.type !== "state_initialized") {
		throw new Error("Initialization committed a non-initialization record");
	}
	return {
		kind: result.kind === "new" ? "initialized" : "duplicate",
		state: result.outcome.state,
	};
}
