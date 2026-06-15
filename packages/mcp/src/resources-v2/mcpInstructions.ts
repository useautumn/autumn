import { readFileSync } from "node:fs";

export const autumnMcpInstructions = readFileSync(
	new URL("./mcpInstructions.md", import.meta.url),
	"utf8",
).trim();
