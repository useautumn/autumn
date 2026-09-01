import { join } from "node:path";
import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import {
	AGENT_ALLOWED_TOOLS,
	AGENT_MODEL,
	DEFAULT_MAX_TURNS,
	DEFAULT_TIMEOUT_MS,
} from "../axConstants.ts";
import type { TurnSource } from "../simulator/types/turnSource.ts";
import { collectAgentEvent } from "./collectAgentEvent.ts";
import { createLiveChat, type LiveChat } from "./renderLiveChat.ts";
import { renderRunFooter, renderTurnBlock } from "./renderTurnBlock.ts";
import { shortText, trace } from "./trace.ts";
import type { AgentRunResult } from "./types/agentRunResult.ts";
import type { ToolUse } from "./types/toolUse.ts";

export type CompletedTurn = {
	index: number;
	userText: string;
	agentText: string;
	subtype: string;
	toolUses: ToolUse[];
	workspaceDir: string;
};

/**
 * Runs one conversation against a real Claude Code session in the workspace.
 * User turns come from a TurnSource (fixed script or deterministic simulator);
 * the next turn is computed only when the previous turn's result message
 * arrives — never on timers. Subscription login is used: the inherited
 * ANTHROPIC_API_KEY is dropped unless AX_EVALS_USE_API_KEY=1.
 *
 * Progress rendering: `chat` (default for a single arm) streams each user
 * turn, tool call, and agent reply the moment it happens; `blocks` (default
 * for concurrent arms) writes one atomic block per completed turn so arms
 * never interleave. AX_EVALS_TRACE=live streams raw events; =0 silences.
 */
export const runAgentCase = async ({
	label,
	cwd,
	turnSource,
	skillPluginDir,
	skillIds,
	maxTurns = DEFAULT_MAX_TURNS,
	timeoutMs = DEFAULT_TIMEOUT_MS,
	renderMode = "blocks",
	systemPromptAppend,
	onTurn,
}: {
	label: string;
	cwd: string;
	turnSource: TurnSource;
	skillPluginDir?: string;
	skillIds?: string[];
	maxTurns?: number;
	timeoutMs?: number;
	renderMode?: "chat" | "blocks";
	/** extra system-prompt context, e.g. a scenario primer */
	systemPromptAppend?: string;
	onTurn?: (turn: CompletedTurn) => void;
}): Promise<AgentRunResult> => {
	const env: Record<string, string | undefined> = {
		...process.env,
		CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
		// Bare `atmn` resolves like it would after npm install: through the
		// workspace's own .bin (where step-tier stubs also live).
		PATH: `${join(cwd, "node_modules/.bin")}:${process.env.PATH ?? ""}`,
	};
	if (process.env.AX_EVALS_USE_API_KEY !== "1") delete env.ANTHROPIC_API_KEY;

	const result: AgentRunResult = {
		toolUses: [],
		loadedSkills: [],
		finalText: "",
		turnTexts: [],
		userTexts: [],
		turns: 0,
		costUsd: 0,
		wallMs: 0,
		timedOut: false,
	};

	const traceEnv = process.env.AX_EVALS_TRACE;
	const rendering =
		traceEnv === "live" || traceEnv === "0" ? "none" : renderMode;
	const chat: LiveChat | undefined =
		rendering === "chat"
			? createLiveChat({ arm: label, workspaceDir: cwd })
			: undefined;
	const renderBlocks = rendering === "blocks";

	// The generator drains this queue; the message loop decides when to
	// enqueue the next turn (on each result) and breaks when the source is dry.
	const queuedTurns: string[] = [];
	const sentTexts: string[] = [];
	let notifyQueued: (() => void) | undefined;
	const enqueueTurn = (text: string) => {
		trace(label, `user: ${shortText(text)}`);
		chat?.user(text);
		queuedTurns.push(text);
		sentTexts.push(text);
		notifyQueued?.();
	};
	async function* userMessages(): AsyncGenerator<SDKUserMessage> {
		for (;;) {
			while (queuedTurns.length === 0)
				await new Promise<void>((resolve) => {
					notifyQueued = resolve;
				});
			const text = queuedTurns.shift();
			if (text === undefined) continue;
			yield {
				type: "user",
				message: { role: "user", content: text },
				parent_tool_use_id: null,
				session_id: "",
			} as SDKUserMessage;
		}
	}

	const started = Date.now();
	const deadline = started + timeoutMs;

	const openingTurn = await turnSource.next("");
	if (openingTurn === null)
		throw new Error("TurnSource produced no opening turn");
	enqueueTurn(openingTurn);

	const session = query({
		prompt: userMessages(),
		options: {
			cwd,
			settingSources: [],
			persistSession: false,
			...(skillPluginDir && {
				plugins: [{ type: "local" as const, path: skillPluginDir }],
			}),
			...(skillIds && { skills: skillIds }),
			...(systemPromptAppend && {
				systemPrompt: {
					type: "preset" as const,
					preset: "claude_code" as const,
					append: systemPromptAppend,
				},
			}),
			model: AGENT_MODEL,
			allowedTools: AGENT_ALLOWED_TOOLS,
			permissionMode: "acceptEdits",
			maxTurns,
			env,
		},
	});

	let turnStartedAt = started;
	let turnStartCostUsd = 0;
	let turnStartToolIndex = 0;
	const renderedResults = new WeakSet<ToolUse>();

	const finishTurn = (subtype: string) => {
		const turnIndex = result.turns - 1;
		const turn: CompletedTurn = {
			index: turnIndex,
			userText: sentTexts[turnIndex] ?? "",
			agentText: result.turnTexts[turnIndex] ?? "",
			subtype,
			toolUses: result.toolUses.slice(turnStartToolIndex),
			workspaceDir: cwd,
		};
		if (renderBlocks) {
			process.stderr.write(
				renderTurnBlock({
					arm: label,
					authSource: result.apiKeySource,
					model: result.model,
					skillLoaded: skillIds
						? skillIds.every((id) => result.loadedSkills.includes(id))
						: undefined,
					turnIndex,
					userText: turn.userText,
					toolUses: turn.toolUses,
					agentText: turn.agentText,
					subtype,
					turnMs: Date.now() - turnStartedAt,
					turnCostUsd: result.costUsd - turnStartCostUsd,
					workspaceDir: cwd,
				}),
			);
		}
		onTurn?.(turn);
		turnStartedAt = Date.now();
		turnStartCostUsd = result.costUsd;
		turnStartToolIndex = result.toolUses.length;
	};

	for await (const message of session) {
		if (Date.now() > deadline) {
			result.timedOut = true;
			process.stderr.write(`│ ✗ TIMEOUT after ${timeoutMs}ms [${label}]\n`);
			break;
		}
		const toolCountBefore = result.toolUses.length;
		collectAgentEvent({ message, result, label });
		if (chat) {
			if (message.type === "system" && message.subtype === "init") {
				chat.header({
					skillLoaded: skillIds
						? skillIds.every((id) => result.loadedSkills.includes(id))
						: undefined,
					authSource: result.apiKeySource,
					model: result.model,
				});
			}
			for (const tool of result.toolUses.slice(toolCountBefore))
				chat.tool(tool);
			if (message.type === "user") {
				for (const tool of result.toolUses) {
					if (tool.result && !renderedResults.has(tool)) {
						renderedResults.add(tool);
						chat.toolResult(tool);
					}
				}
			}
		}
		if (message.type === "result") {
			chat?.agentText(result.finalText);
			chat?.turnDone({
				turnIndex: result.turns - 1,
				subtype: message.subtype,
				turnMs: Date.now() - turnStartedAt,
				turnCostUsd: result.costUsd - turnStartCostUsd,
			});
			finishTurn(message.subtype);
			const nextText =
				sentTexts.length < turnSource.maxUserTurns
					? await turnSource.next(result.finalText)
					: null;
			if (nextText === null) break;
			enqueueTurn(nextText);
		}
	}

	result.wallMs = Date.now() - started;
	result.userTexts = sentTexts;
	if (chat) {
		chat.footer({
			turns: result.turns,
			wallMs: result.wallMs,
			costUsd: result.costUsd,
		});
	} else if (renderBlocks) {
		process.stderr.write(
			renderRunFooter({
				arm: label,
				turns: result.turns,
				wallMs: result.wallMs,
				costUsd: result.costUsd,
			}),
		);
	} else {
		trace(
			label,
			`done: ${result.turns} turns, ${(result.wallMs / 1000).toFixed(1)}s, $${result.costUsd.toFixed(3)}`,
		);
	}
	return result;
};
