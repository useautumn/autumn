import chalk from "chalk";
import { describeToolUse, isKeyToolUse } from "./describeToolUse.ts";
import type { ToolUse } from "./types/toolUse.ts";

const SHOWN_TOOL_LINES = 4;
const TEXT_WIDTH = 64;
const MAX_TEXT_LINES = 3;

const armColor = (arm: string) =>
	arm.endsWith("without") ? chalk.yellow : chalk.cyan;

const wrap = (text: string, maxLines = MAX_TEXT_LINES): string[] => {
	const words = text.replaceAll("\n", " ").trim().split(/\s+/);
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		if (`${current} ${word}`.trim().length > TEXT_WIDTH) {
			lines.push(current.trim());
			current = word;
			if (lines.length === maxLines) {
				lines[maxLines - 1] += "…";
				return lines;
			}
		} else {
			current = `${current} ${word}`;
		}
	}
	if (current.trim()) lines.push(current.trim());
	return lines;
};

const speech = (label: string, text: string, labelColor: typeof chalk.blue) => {
	let block = `│\n│  ${labelColor.bold(label)}\n`;
	for (const line of wrap(text)) block += `│  ${chalk.dim("│")} ${line}\n`;
	return block;
};

/**
 * One self-contained block per completed turn, written atomically so
 * concurrent arms never interleave mid-block. Conversation-shaped: user →
 * tools → agent → verdict, with color as the visual cue.
 */
export const renderTurnBlock = ({
	arm,
	authSource,
	model,
	skillLoaded,
	turnIndex,
	userText,
	toolUses,
	agentText,
	subtype,
	turnMs,
	turnCostUsd,
	workspaceDir,
}: {
	arm: string;
	authSource?: string;
	model?: string;
	skillLoaded?: boolean;
	turnIndex: number;
	userText: string;
	toolUses: ToolUse[];
	agentText: string;
	subtype: string;
	turnMs: number;
	turnCostUsd: number;
	workspaceDir: string;
}): string => {
	const color = armColor(arm);
	let block = "";

	if (turnIndex === 0) {
		const skillNote =
			skillLoaded === undefined
				? chalk.dim("no skills (baseline)")
				: skillLoaded
					? chalk.green("skills loaded ✓")
					: chalk.red("⚠ SKILLS NOT LOADED");
		const auth =
			authSource === "none"
				? chalk.dim("subscription auth")
				: chalk.red(`⚠ API KEY (${authSource ?? "unknown"})`);
		const modelNote = model ? ` · ${chalk.dim(model)}` : "";
		block += `\n┌─ ${color.bold(arm)} · ${skillNote} · ${auth}${modelNote} ${chalk.dim("─".repeat(6))}\n`;
	}

	block += speech("user", userText, chalk.blue);

	const shown = toolUses.filter(
		(tool, index) => index < SHOWN_TOOL_LINES || isKeyToolUse(tool),
	);
	const collapsed = toolUses.length - shown.length;
	if (shown.length > 0) block += "│\n";
	for (const tool of shown) {
		const bullet = isKeyToolUse(tool) ? color("●") : chalk.dim("●");
		block += `│  ${bullet} ${describeToolUse(tool, workspaceDir)}\n`;
	}
	if (collapsed > 0)
		block += `│  ${chalk.dim(`· ${collapsed} more exploration calls`)}\n`;

	if (agentText.trim()) block += speech("agent", agentText, chalk.white);

	const verdict =
		subtype === "success" ? chalk.green("✓") : chalk.red(`✗ ${subtype}`);
	block += `│\n│  ${verdict} ${chalk.dim(`turn ${turnIndex + 1} · ${(turnMs / 1000).toFixed(1)}s · $${turnCostUsd.toFixed(2)}`)}\n`;
	return block;
};

/** Closing line for an arm's block, colored like its header. */
export const renderRunFooter = ({
	arm,
	turns,
	wallMs,
	costUsd,
}: {
	arm: string;
	authSource?: string;
	model?: string;
	turns: number;
	wallMs: number;
	costUsd: number;
}): string =>
	`└─ ${armColor(arm)(arm)} ${chalk.dim(`· ${turns} turns · ${(wallMs / 1000).toFixed(1)}s · $${costUsd.toFixed(2)}`)}\n`;
