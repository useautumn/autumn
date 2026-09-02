import chalk from "chalk";
import { describeToolUse, isKeyToolUse } from "./describeToolUse.ts";
import type { ToolUse } from "./types/toolUse.ts";

/** Strip the shared experiment prefix so parallel lines stay short. */
const shortArm = (arm: string): string =>
	arm.replace(/^(basics|fill|misc|suites)-/, "").replace(/\/with$/, "");

const armColor = (arm: string) =>
	arm.endsWith("without") ? chalk.yellow : chalk.cyan;

/** What happened this turn, in one phrase: key tool uses, else the reply. */
const turnGist = ({
	toolUses,
	agentText,
	workspaceDir,
}: {
	toolUses: ToolUse[];
	agentText: string;
	workspaceDir: string;
}): string => {
	const key = toolUses.filter(isKeyToolUse);
	if (key.length > 0) {
		const shown = key
			.slice(-2)
			.map((tool) => describeToolUse(tool, workspaceDir));
		const extra = toolUses.length - key.slice(-2).length;
		return `${shown.join(", ")}${extra > 0 ? chalk.dim(` +${extra} tools`) : ""}`;
	}
	if (toolUses.length > 0)
		return `${describeToolUse(toolUses[toolUses.length - 1] as ToolUse, workspaceDir)}${toolUses.length > 1 ? chalk.dim(` +${toolUses.length - 1} tools`) : ""}`;
	const flat = agentText.replaceAll("\n", " ").trim();
	return flat.length > 72
		? `${flat.slice(0, 72)}…`
		: flat || chalk.dim("(no reply)");
};

/**
 * One atomic line per completed turn, tagged by case — for parallel runs
 * where streaming chat or per-turn blocks would interleave unreadably.
 */
export const renderCompactTurn = ({
	arm,
	turnIndex,
	subtype,
	turnMs,
	toolUses,
	agentText,
	workspaceDir,
}: {
	arm: string;
	turnIndex: number;
	subtype: string;
	turnMs: number;
	toolUses: ToolUse[];
	agentText: string;
	workspaceDir: string;
}): string => {
	const ok = subtype === "success" ? chalk.dim("●") : chalk.red("●");
	const gist = turnGist({ toolUses, agentText, workspaceDir });
	return `${ok} ${armColor(arm)(shortArm(arm).padEnd(28))} ${chalk.dim(`turn ${turnIndex + 1}`)} · ${gist} ${chalk.dim(`· ${Math.round(turnMs / 1000)}s`)}\n`;
};
