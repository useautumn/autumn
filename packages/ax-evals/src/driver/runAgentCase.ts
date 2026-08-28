import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import {
	AGENT_ALLOWED_TOOLS,
	AGENT_MODEL,
	DEFAULT_MAX_TURNS,
	DEFAULT_TIMEOUT_MS,
} from "../axConstants.ts";
import type { TurnSource } from "../simulator/types/turnSource.ts";
import { collectAgentEvent } from "./collectAgentEvent.ts";
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
 * Progress rendering: one atomic block per completed turn (never interleaves
 * across arms). AX_EVALS_TRACE=live streams raw events instead; =0 silences.
 */
export const runAgentCase = async ({
	label,
	cwd,
	turnSource,
	skillPluginDir,
	skillIds,
	maxTurns = DEFAULT_MAX_TURNS,
	timeoutMs = DEFAULT_TIMEOUT_MS,
	onTurn,
}: {
	label: string;
	cwd: string;
	turnSource: TurnSource;
	skillPluginDir?: string;
	skillIds?: string[];
	maxTurns?: number;
	timeoutMs?: number;
	onTurn?: (turn: CompletedTurn) => void;
}): Promise<AgentRunResult> => {
	const env: Record<string, string | undefined> = {
		...process.env,
		CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
	};
	if (process.env.AX_EVALS_USE_API_KEY !== "1") delete env.ANTHROPIC_API_KEY;

	const result: AgentRunResult = {
		toolUses: [],
		loadedSkills: [],
		finalText: "",
		turnTexts: [],
		turns: 0,
		costUsd: 0,
		wallMs: 0,
		timedOut: false,
	};

	// The generator drains this queue; the message loop decides when to
	// enqueue the next turn (on each result) and breaks when the source is dry.
	const queuedTurns: string[] = [];
	const sentTexts: string[] = [];
	let notifyQueued: (() => void) | undefined;
	const enqueueTurn = (text: string) => {
		trace(label, `user: ${shortText(text)}`);
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

	const openingTurn = turnSource.next("");
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
			model: AGENT_MODEL,
			allowedTools: AGENT_ALLOWED_TOOLS,
			permissionMode: "acceptEdits",
			maxTurns,
			env,
		},
	});

	const renderBlocks =
		process.env.AX_EVALS_TRACE !== "live" && process.env.AX_EVALS_TRACE !== "0";
	let turnStartedAt = started;
	let turnStartCostUsd = 0;
	let turnStartToolIndex = 0;

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
		collectAgentEvent({ message, result, label });
		if (message.type === "result") {
			finishTurn(message.subtype);
			const nextText =
				sentTexts.length < turnSource.maxUserTurns
					? turnSource.next(result.finalText)
					: null;
			if (nextText === null) break;
			enqueueTurn(nextText);
		}
	}

	result.wallMs = Date.now() - started;
	if (renderBlocks) {
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
