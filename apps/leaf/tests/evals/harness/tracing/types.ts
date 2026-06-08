import type { AutumnApiCall } from "../context/types.js";
import type { EvalToolCall } from "../drivers/types.js";

export type EvalTraceLevel = "off" | "steps";

export type EvalTraceEvent =
	| { type: "eval_started"; name?: string }
	| { type: "user_turn"; message: string }
	| { type: "agent_text"; text: string }
	| { type: "tool_call"; call: EvalToolCall }
	| { type: "api_call"; call: AutumnApiCall }
	| { type: "api_response"; endpoint: string; response: unknown }
	| { type: "approval_pending" }
	| { type: "approval_approved" }
	| { type: "eval_finished" };

export type EvalTrace = {
	event(event: EvalTraceEvent): void;
	entries(): EvalTraceEvent[];
	print(): void;
};
