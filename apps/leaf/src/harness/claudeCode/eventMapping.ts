import type { CanUseTool, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
	HarnessApproval,
	HarnessEvent,
	HarnessToolCall,
} from "../types.js";
import { parseToolName } from "./utils/toolUtils.js";

export type PendingApproval = { id: string } & HarnessToolCall;
export type PendingApprovalRef = { current?: PendingApproval };
export type SessionRef = { current?: string };

const APPROVAL_DENY_MESSAGE =
	"This action requires explicit user approval before it can run. Stop and tell the user what you want to do.";

/** Resolves the approval config (predicate or descriptor) to a predicate. */
export const approvalPredicate = (approval?: HarnessApproval) => {
	if (!approval) return undefined;
	if (typeof approval === "function") return approval;
	const toolNames = new Set(approval.toolNames);
	return (tool: HarnessToolCall) =>
		tool.mcpServer === approval.mcpServer && toolNames.has(tool.name);
};

/** Shared canUseTool: deny-and-capture destructive tool calls so the host can gate them. */
export const buildCanUseTool = ({
	pendingApprovalRef,
	requiresApproval,
}: {
	pendingApprovalRef: PendingApprovalRef;
	requiresApproval?: (tool: HarnessToolCall) => boolean;
}): CanUseTool => {
	return async (toolName, input) => {
		const tool = {
			...parseToolName({ rawName: toolName }),
			input: input as Record<string, unknown>,
		};
		if (requiresApproval?.(tool)) {
			pendingApprovalRef.current = { id: crypto.randomUUID(), ...tool };
			return {
				behavior: "deny",
				interrupt: true,
				message: APPROVAL_DENY_MESSAGE,
			};
		}
		return { behavior: "allow", updatedInput: input };
	};
};

/**
 * The single turn loop shared by the in-process harness and the sandbox runner:
 * maps SDK messages to HarnessEvents, tracks the session id, and resolves the
 * deny-captured approval. Ends after the SDK `result` message.
 */
export async function* mapQueryToEvents({
	messages,
	pendingApprovalRef,
	sessionRef,
}: {
	messages: AsyncIterable<SDKMessage>;
	pendingApprovalRef: PendingApprovalRef;
	sessionRef: SessionRef;
}): AsyncGenerator<HarnessEvent> {
	const toolNamesByUseId = new Map<string, string>();
	try {
		for await (const sdkMessage of messages) {
			if ("session_id" in sdkMessage && sdkMessage.session_id) {
				sessionRef.current = sdkMessage.session_id;
			}

			if (sdkMessage.type === "assistant") {
				// Subagent traffic carries parent_tool_use_id; surface top-level only.
				if (sdkMessage.parent_tool_use_id) continue;
				for (const block of sdkMessage.message.content) {
					if (block.type === "text" && block.text) {
						yield { text: block.text, type: "text" };
					} else if (block.type === "tool_use") {
						toolNamesByUseId.set(block.id, block.name);
						yield {
							...parseToolName({ rawName: block.name }),
							input: (block.input ?? {}) as Record<string, unknown>,
							type: "tool_call",
						};
					}
				}
			} else if (sdkMessage.type === "user") {
				const content = sdkMessage.message.content;
				if (!Array.isArray(content)) continue;
				for (const block of content) {
					if (block.type !== "tool_result" || !block.tool_use_id) continue;
					const rawName = toolNamesByUseId.get(block.tool_use_id);
					if (!rawName) continue;
					yield {
						name: parseToolName({ rawName }).name,
						output: block.content,
						type: "tool_result",
					};
				}
			} else if (sdkMessage.type === "result") {
				if (pendingApprovalRef.current) {
					yield { ...pendingApprovalRef.current, type: "approval_required" };
				} else if (sdkMessage.subtype === "success") {
					yield {
						type: "turn_end",
						usage: {
							costUsd: sdkMessage.total_cost_usd,
							inputTokens: sdkMessage.usage.input_tokens,
							outputTokens: sdkMessage.usage.output_tokens,
						},
					};
				} else {
					yield {
						message:
							sdkMessage.errors.join("; ") ||
							`Harness turn failed: ${sdkMessage.subtype}`,
						type: "error",
					};
				}
				return;
			}
		}
	} catch (error) {
		// The approval deny-interrupt can surface as an SDK error result; the turn is over either way.
		if (pendingApprovalRef.current) {
			yield { ...pendingApprovalRef.current, type: "approval_required" };
			return;
		}
		yield {
			message: error instanceof Error ? error.message : String(error),
			type: "error",
		};
	}
}
