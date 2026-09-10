import chalk from "chalk";
import { describeToolUse, isKeyToolUse } from "./describeToolUse.ts";
import { describeAuthSource } from "./openRouterRouting.ts";
import { chatTextWidth, renderMarkdown } from "./renderMarkdown.ts";
import type { ToolUse } from "./types/toolUse.ts";

const wrap = (text: string): string[] => {
	const width = chatTextWidth();
	const lines: string[] = [];
	for (const paragraph of text.split("\n")) {
		const words = paragraph.trim().split(/\s+/).filter(Boolean);
		if (words.length === 0) continue;
		let current = "";
		for (const word of words) {
			if (`${current} ${word}`.trim().length > width) {
				lines.push(current.trim());
				current = word;
			} else {
				current = `${current} ${word}`;
			}
		}
		if (current.trim()) lines.push(current.trim());
	}
	return lines;
};

export type LiveChat = {
	header: (meta: {
		skillLoaded?: boolean;
		authSource?: string;
		model?: string;
	}) => void;
	user: (text: string) => void;
	tool: (tool: ToolUse) => void;
	toolResult: (tool: ToolUse) => void;
	agentText: (text: string) => void;
	turnDone: (meta: {
		turnIndex: number;
		subtype: string;
		turnMs: number;
		turnCostUsd: number;
	}) => void;
	footer: (meta: { turns: number; wallMs: number; costUsd: number }) => void;
};

/**
 * Streams the conversation as it happens — each user turn, tool call, and
 * agent reply is printed the moment the SDK emits it, like watching a live
 * session. Only used when a single arm runs (concurrent arms would
 * interleave; they use the atomic per-turn blocks instead).
 */
export const createLiveChat = ({
	arm,
	workspaceDir,
	write = (line) => process.stderr.write(line),
}: {
	arm: string;
	workspaceDir: string;
	write?: (line: string) => void;
}): LiveChat => {
	const color = arm.endsWith("without") ? chalk.yellow : chalk.cyan;
	let headerPrinted = false;
	// The opening user turn is enqueued before the SDK's init event carries
	// the header metadata, so it waits here until the header goes out.
	let pendingUser: string | null = null;

	const speech = (
		label: string,
		text: string,
		labelColor: typeof chalk.blue,
	) => {
		let block = `│\n│  ${labelColor.bold(label)}\n`;
		for (const line of wrap(text)) block += `│  ${chalk.dim("│")} ${line}\n`;
		write(block);
	};

	// Exploration calls (reads, greps, ls…) are batched onto shared dim lines;
	// key calls (skills, writes) and errors get their own line.
	let pendingExploration: string[] = [];
	const flushExploration = () => {
		if (pendingExploration.length === 0) return;
		const joined = pendingExploration.join(" · ");
		pendingExploration = [];
		for (const line of wrap(joined)) write(`│  ${chalk.dim(`● ${line}`)}\n`);
	};

	return {
		header: ({ skillLoaded, authSource, model }) => {
			// The SDK re-emits init (e.g. per streamed user message); one header.
			if (headerPrinted) return;
			const skillNote =
				skillLoaded === undefined
					? chalk.dim("no skills (baseline)")
					: skillLoaded
						? chalk.green("skills loaded ✓")
						: chalk.red("⚠ SKILLS NOT LOADED");
			const authLabel = describeAuthSource({ authSource, model });
			const auth = authLabel.unexpected
				? chalk.red(authLabel.text)
				: chalk.dim(authLabel.text);
			const modelNote = model ? ` · ${chalk.dim(model)}` : "";
			write(
				`\n┌─ ${color.bold(arm)} · ${skillNote} · ${auth}${modelNote} ${chalk.dim("─".repeat(6))}\n`,
			);
			headerPrinted = true;
			if (pendingUser !== null) {
				speech("user", pendingUser, chalk.blue);
				pendingUser = null;
			}
		},
		user: (text) => {
			if (!headerPrinted) {
				pendingUser = text;
				return;
			}
			flushExploration();
			speech("user", text, chalk.blue);
		},
		tool: (tool) => {
			if (!isKeyToolUse(tool)) {
				pendingExploration.push(describeToolUse(tool, workspaceDir));
				return;
			}
			flushExploration();
			write(`│  ${color("●")} ${describeToolUse(tool, workspaceDir)}\n`);
		},
		toolResult: (tool) => {
			const { result } = tool;
			// Success output is noise at this zoom level; surface only failures.
			if (!result?.isError) return;
			const flat = result.text.replaceAll("\n", " ").trim();
			if (!flat) return;
			flushExploration();
			const width = chatTextWidth() - 6;
			const text = flat.length > width ? `${flat.slice(0, width)}…` : flat;
			write(
				`│    ${chalk.dim("↳")} ${chalk.red(`${describeToolUse(tool, workspaceDir)} → ${text}`)}\n`,
			);
		},
		agentText: (text) => {
			if (!text.trim()) return;
			flushExploration();
			let block = `│\n│  ${chalk.white.bold("agent")}\n`;
			for (const line of renderMarkdown(text).split("\n"))
				block += `│  ${chalk.dim("│")} ${line}\n`;
			write(block);
		},
		turnDone: ({ turnIndex, subtype, turnMs, turnCostUsd }) => {
			flushExploration();
			const verdict =
				subtype === "success" ? chalk.green("✓") : chalk.red(`✗ ${subtype}`);
			write(
				`│\n│  ${verdict} ${chalk.dim(`turn ${turnIndex + 1} · ${(turnMs / 1000).toFixed(1)}s · $${turnCostUsd.toFixed(2)}`)}\n`,
			);
		},
		footer: ({ turns, wallMs, costUsd }) => {
			flushExploration();
			write(
				`└─ ${color(arm)} ${chalk.dim(`· ${turns} turns · ${(wallMs / 1000).toFixed(1)}s · $${costUsd.toFixed(2)}`)}\n`,
			);
		},
	};
};
