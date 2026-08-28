import type { ToolUse } from "./types/toolUse.ts";

const shorten = (text: string, max: number) => {
	const flat = text.replaceAll("\n", " ").trim();
	return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

const fileName = (path: unknown, workspaceDir: string) =>
	String(path ?? "")
		.replace(`/private${workspaceDir}`, "")
		.replace(workspaceDir, "")
		.replace(/^\//, "");

const firstCommand = (command: unknown) => {
	const [head] = String(command ?? "").split(/&&|\|\|/, 1);
	return shorten(head ?? "", 48);
};

/** One human-readable line per tool call, e.g. "ran `npx atmn preview`". */
export const describeToolUse = (
	tool: ToolUse,
	workspaceDir: string,
): string => {
	switch (tool.name) {
		case "Skill":
			return `used skill ${String(tool.input.skill ?? "")}`;
		case "Write":
			return `wrote ${fileName(tool.input.file_path, workspaceDir)}`;
		case "Edit":
			return `edited ${fileName(tool.input.file_path, workspaceDir)}`;
		case "Read":
			return `read ${fileName(tool.input.file_path, workspaceDir)}`;
		case "Bash":
			return `ran \`${firstCommand(tool.input.command)}\``;
		case "Glob":
			return `searched files ${shorten(String(tool.input.pattern ?? ""), 40)}`;
		case "Grep":
			return `searched text ${shorten(String(tool.input.pattern ?? ""), 40)}`;
		default:
			return `${tool.name} ${shorten(JSON.stringify(tool.input), 40)}`;
	}
};

/** Skills and file writes always matter; exploration calls are collapsible. */
export const isKeyToolUse = (tool: ToolUse) =>
	tool.name === "Skill" || tool.name === "Write" || tool.name === "Edit";
