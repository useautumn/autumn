import type { MessageListInput } from "@mastra/core/agent/message-list";
import type { EvalSetup } from "../../fixtures/types.js";
import type { EvalRuntimeContext } from "../context/types.js";
import type { EvalTrace } from "../tracing/types.js";

export type EvalToolCall = {
	args: Record<string, unknown>;
	name: string;
};

export type EvalAgentOutput = {
	text?: string;
};

export type EvalDriverMessage = string | MessageListInput;

export type EvalDriverStartInput = {
	context: EvalRuntimeContext;
	name?: string;
	setup: EvalSetup;
	today?: Date;
	trace: EvalTrace;
};

export type RunningEvalDriver = {
	approve(options?: { maxSteps?: number }): Promise<EvalAgentOutput>;
	cleanup(): Promise<void>;
	getToolCalls(): EvalToolCall[];
	hasPendingApproval(): boolean;
	send(
		message: EvalDriverMessage,
		options?: { maxSteps?: number },
	): Promise<EvalAgentOutput>;
};

export type EvalAgentDriver = {
	name: string;
	start(input: EvalDriverStartInput): Promise<RunningEvalDriver>;
};
