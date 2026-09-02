import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { AGENT_MODEL, DEFAULT_MAX_TURNS, DEFAULT_TIMEOUT_MS } from "../axConstants.ts";
import type { TurnSource } from "../simulator/types/turnSource.ts";
import { buildCaseEnv } from "./caseEnv.ts";
import { type CodexEvent, collectCodexEvent } from "./collectCodexEvent.ts";
import { createLiveChat, type LiveChat } from "./renderLiveChat.ts";
import { renderRunFooter, renderTurnBlock } from "./renderTurnBlock.ts";
import { shortText, trace } from "./trace.ts";
import type { AgentRunResult } from "./types/agentRunResult.ts";
import type { CompletedTurn } from "./runAgentCase.ts";

/** One `codex exec` process = one user turn; the thread id from turn 1 is
 * resumed for every later turn so the conversation continues. */
// The spawn cwd is the workspace, so no -C (which `resume` doesn't accept).
const codexArgs = ({
	threadId,
	prompt,
}: {
	threadId: string | undefined;
	prompt: string;
}): string[] => [
	"exec",
	...(threadId ? ["resume", threadId] : []),
	"--json",
	"--skip-git-repo-check",
	// Pinned, not inherited from the host's ~/.codex/config.toml.
	"-c",
	'service_tier="fast"',
	// Workspaces are throwaway temp dirs and atmn needs network access; this
	// mirrors the claude harness's acceptEdits + unrestricted Bash.
	"--dangerously-bypass-approvals-and-sandbox",
	...(AGENT_MODEL ? ["-m", AGENT_MODEL] : []),
	prompt,
];

/**
 * Runs one conversation against the Codex CLI (`codex exec --json`), on the
 * user's ChatGPT subscription. Mirrors runAgentCase: user turns come from a
 * TurnSource, tool events stream to the same renderers, and the result is the
 * same AgentRunResult shape. Cost is always $0 (subscription-billed).
 */
export const runCodexCase = async ({
	label,
	cwd,
	turnSource,
	skillIds,
	maxTurns = DEFAULT_MAX_TURNS,
	timeoutMs = DEFAULT_TIMEOUT_MS,
	renderMode = "blocks",
	systemPromptAppend,
	extraEnv,
	onTurn,
}: {
	label: string;
	cwd: string;
	turnSource: TurnSource;
	skillIds?: string[];
	maxTurns?: number;
	timeoutMs?: number;
	renderMode?: "chat" | "blocks";
	systemPromptAppend?: string;
	extraEnv?: Record<string, string>;
	onTurn?: (turn: CompletedTurn) => void;
}): Promise<AgentRunResult> => {
	const env = buildCaseEnv({ cwd, extraEnv });

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
		model: AGENT_MODEL || "codex default",
		apiKeySource: "none",
	};

	const traceEnv = process.env.AX_EVALS_TRACE;
	const rendering =
		traceEnv === "live" || traceEnv === "0" ? "none" : renderMode;
	const chat: LiveChat | undefined =
		rendering === "chat"
			? createLiveChat({ arm: label, workspaceDir: cwd })
			: undefined;
	const renderBlocks = rendering === "blocks";

	const started = Date.now();
	const deadline = started + timeoutMs;
	const sentTexts: string[] = [];
	let threadId: string | undefined;

	// Codex discovers .codex/skills at startup; equipped means available.
	const skillLoaded = skillIds && skillIds.length > 0 ? true : undefined;
	chat?.header({ skillLoaded, authSource: "none", model: result.model });

	const runTurn = async (userText: string): Promise<string> => {
		trace(label, `user: ${shortText(userText)}`);
		chat?.user(userText);
		sentTexts.push(userText);
		const turnStartedAt = Date.now();
		const turnStartToolIndex = result.toolUses.length;
		// Codex has no system-prompt flag; the primer rides in the first turn.
		const prompt =
			sentTexts.length === 1 && systemPromptAppend
				? `<context>\n${systemPromptAppend}\n</context>\n\n${userText}`
				: userText;

		const child = spawn("codex", codexArgs({ threadId, prompt }), {
			cwd,
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const killTimer = setTimeout(
			() => child.kill("SIGKILL"),
			Math.max(deadline - Date.now(), 0),
		);

		let stderrTail = "";
		child.stderr.on("data", (chunk: Buffer) => {
			stderrTail = `${stderrTail}${chunk}`.slice(-2000);
		});

		const lines = createInterface({ input: child.stdout });
		for await (const line of lines) {
			if (!line.trim().startsWith("{")) continue;
			let event: CodexEvent;
			try {
				event = JSON.parse(line) as CodexEvent;
			} catch {
				continue;
			}
			if (event.type === "thread.started" && event.thread_id)
				threadId = event.thread_id;
			const { startedTool, finishedTool, fileTools } = collectCodexEvent({
				event,
				result,
				label,
			});
			if (chat) {
				if (startedTool) chat.tool(startedTool);
				if (finishedTool) chat.toolResult(finishedTool);
				for (const tool of fileTools ?? []) chat.tool(tool);
			}
		}

		const exitCode: number = await new Promise((resolve) =>
			child.on("close", (code) => resolve(code ?? 1)),
		);
		clearTimeout(killTimer);
		if (Date.now() >= deadline) {
			result.timedOut = true;
			process.stderr.write(`│ ✗ TIMEOUT after ${timeoutMs}ms [${label}]\n`);
		} else if (exitCode !== 0) {
			throw new Error(
				`codex exec exited ${exitCode} [${label}]: ${stderrTail.trim().slice(-500)}`,
			);
		}

		const subtype = result.timedOut ? "timeout" : "success";
		result.turnTexts.push(result.finalText);
		result.turns += 1;
		const turnIndex = result.turns - 1;
		const turn: CompletedTurn = {
			index: turnIndex,
			userText,
			agentText: result.turnTexts[turnIndex] ?? "",
			subtype,
			toolUses: result.toolUses.slice(turnStartToolIndex),
			workspaceDir: cwd,
		};
		chat?.agentText(result.finalText);
		chat?.turnDone({
			turnIndex,
			subtype,
			turnMs: Date.now() - turnStartedAt,
			turnCostUsd: 0,
		});
		if (renderBlocks) {
			process.stderr.write(
				renderTurnBlock({
					arm: label,
					authSource: "none",
					model: result.model,
					skillLoaded,
					turnIndex,
					userText,
					toolUses: turn.toolUses,
					agentText: turn.agentText,
					subtype,
					turnMs: Date.now() - turnStartedAt,
					turnCostUsd: 0,
					workspaceDir: cwd,
				}),
			);
		}
		onTurn?.(turn);
		return result.finalText;
	};

	const openingTurn = await turnSource.next("");
	if (openingTurn === null)
		throw new Error("TurnSource produced no opening turn");

	let reply = await runTurn(openingTurn);
	while (
		!result.timedOut &&
		result.turns < maxTurns &&
		sentTexts.length < turnSource.maxUserTurns
	) {
		const nextText = await turnSource.next(reply);
		if (nextText === null) break;
		reply = await runTurn(nextText);
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
	}
	return result;
};
