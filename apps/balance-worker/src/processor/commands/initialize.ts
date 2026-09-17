import {
	type InitializationDecision,
	type InitializeCommand,
	parseInitializeCommand,
} from "@autumn/balance-engine";
import { initializeSubject } from "../actions/initializeSubject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

/** The server hands over a customer's rows; the worker makes them the baseline unless it already has one. */
export async function initialize({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: InitializeCommand;
}): Promise<InitializationDecision> {
	const parsed = parseInitializeCommand({ input: command });
	return await initializeSubject({ ctx: scope.ctx, command: parsed });
}
