import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { shortText, trace } from "./trace.ts";
import type { AgentRunResult } from "./types/agentRunResult.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Folds one SDK stream event into the run result, tracing as it goes. */
export const collectAgentEvent = ({
	message,
	result,
	label,
}: {
	message: SDKMessage;
	result: AgentRunResult;
	label: string;
}) => {
	if (message.type === "system" && message.subtype === "init") {
		result.loadedSkills = message.skills;
		result.apiKeySource = message.apiKeySource;
		result.model = message.model;
		trace(label, `init: skills=[${message.skills.join(", ")}]`);
		return;
	}

	if (message.type === "assistant") {
		for (const block of message.message.content) {
			if (block.type === "tool_use") {
				const input = isRecord(block.input) ? block.input : {};
				result.toolUses.push({ name: block.name, input, turn: result.turns });
				const detail =
					block.name === "Skill"
						? String(input.skill ?? "")
						: shortText(
								input.file_path ?? input.command ?? input.pattern ?? "",
								60,
							);
				trace(label, `tool: ${block.name} ${detail}`);
			}
			if (block.type === "text" && block.text.trim()) {
				result.finalText = block.text;
			}
		}
		return;
	}

	if (message.type === "result") {
		result.turnTexts.push(result.finalText);
		result.turns += 1;
		result.costUsd = message.total_cost_usd;
		trace(
			label,
			`turn ${result.turns} done (${message.subtype}) — $${result.costUsd.toFixed(3)} total`,
		);
	}
};
