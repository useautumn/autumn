import { shortText, trace } from "./trace.ts";
import type { AgentRunResult } from "./types/agentRunResult.ts";
import type { ToolUse } from "./types/toolUse.ts";

/** A Codex `codex exec --json` JSONL event (the fields we read). */
export type CodexEvent = {
	type: string;
	thread_id?: string;
	item?: {
		id?: string;
		type?: string;
		text?: string;
		command?: string;
		aggregated_output?: string;
		exit_code?: number | null;
		status?: string;
		changes?: { path?: string; kind?: string }[];
		message?: string;
	};
};

const SKILL_READ = /\.codex\/skills\/([\w-]+)\/SKILL\.md/;

/** Codex has no Skill tool — it reads SKILL.md via shell. Surface that as the
 * same Skill tool-use shape the graders and renderers already understand. */
const toToolUse = ({
	item,
	turn,
}: {
	item: NonNullable<CodexEvent["item"]>;
	turn: number;
}): ToolUse | undefined => {
	if (item.type === "command_execution") {
		const skillName = SKILL_READ.exec(item.command ?? "")?.[1];
		if (skillName) {
			return {
				name: "Skill",
				input: { skill: `autumn:${skillName}` },
				turn,
				id: item.id,
			};
		}
		return {
			name: "Bash",
			input: { command: item.command ?? "" },
			turn,
			id: item.id,
		};
	}
	if (item.type === "web_search") {
		return {
			name: "WebSearch",
			input: { query: item.text ?? "" },
			turn,
			id: item.id,
		};
	}
	if (item.type === "mcp_tool_call") {
		return {
			name: "McpTool",
			input: { call: item.text ?? "" },
			turn,
			id: item.id,
		};
	}
	return undefined;
};

/** Folds one Codex JSONL event into the run result; returns what happened so
 * the driver can render it. */
export const collectCodexEvent = ({
	event,
	result,
	label,
}: {
	event: CodexEvent;
	result: AgentRunResult;
	label: string;
}): {
	startedTool?: ToolUse;
	finishedTool?: ToolUse;
	fileTools?: ToolUse[];
} => {
	const item = event.item;

	if (event.type === "item.started" && item) {
		const tool = toToolUse({ item, turn: result.turns });
		if (!tool) return {};
		result.toolUses.push(tool);
		if (tool.name === "Skill") {
			const skillId = String(tool.input.skill);
			if (!result.loadedSkills.includes(skillId))
				result.loadedSkills.push(skillId);
		}
		trace(
			label,
			`tool: ${tool.name} ${shortText(String(tool.input.command ?? tool.input.skill ?? ""), 60)}`,
		);
		return { startedTool: tool };
	}

	if (event.type === "item.completed" && item) {
		if (item.type === "agent_message" && item.text?.trim()) {
			result.finalText = item.text;
			return {};
		}
		if (item.type === "file_change") {
			const fileTools = (item.changes ?? []).map(
				(change): ToolUse => ({
					name: change.kind === "add" ? "Write" : "Edit",
					input: { file_path: change.path ?? "" },
					turn: result.turns,
				}),
			);
			result.toolUses.push(...fileTools);
			return { fileTools };
		}
		if (
			item.type === "command_execution" ||
			item.type === "web_search" ||
			item.type === "mcp_tool_call"
		) {
			const tool = result.toolUses.find(
				(candidate) => candidate.id !== undefined && candidate.id === item.id,
			);
			// Some command items only ever emit item.completed.
			if (!tool) {
				const started = toToolUse({ item, turn: result.turns });
				if (started) result.toolUses.push(started);
				return started ? { startedTool: started } : {};
			}
			tool.result = {
				text: item.aggregated_output ?? "",
				isError: (item.exit_code ?? 0) !== 0,
			};
			trace(label, `tool result: ${shortText(tool.result.text)}`);
			return { finishedTool: tool };
		}
		if (item.type === "error") {
			trace(label, `error item: ${shortText(item.message ?? "")}`);
		}
	}

	return {};
};
