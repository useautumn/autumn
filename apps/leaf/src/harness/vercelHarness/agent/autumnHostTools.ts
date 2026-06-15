import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import { jsonSchema, type ToolSet, tool } from "ai";
import {
	createAutumnMcpClient,
	getAutumnMcpTools,
} from "../../../agent/tools/autumnMcp.js";
import type { PreviewCapture } from "../../../agent/tools/toolPolicy.js";

// Every Autumn MCP tool takes `{ request: <object>, intent?: string }` (no-arg
// tools just omit request). Mastra erases the per-tool schema, so we declare the
// shared envelope here: `request` must be an OBJECT (else the model stringifies
// it), and the inner fields come from the MCP docs in the system prompt. A
// schema with no declared properties is stripped to {} by the AI SDK, so this
// envelope is required for args to reach the tool at all.
const autumnInputSchema = jsonSchema<Record<string, unknown>>({
	additionalProperties: true,
	properties: {
		intent: {
			description: "One-sentence description of what this call does.",
			type: "string",
		},
		request: { additionalProperties: true, type: "object" },
	},
	required: ["intent"],
	type: "object",
});

// The sandbox bridge can serialize nested object args as JSON strings; the
// Autumn MCP requires `request` to be an object, so parse it back if needed.
const normalizeArgs = (
	args: Record<string, unknown>,
): Record<string, unknown> => {
	if (typeof args.request !== "string") return args;
	try {
		return { ...args, request: JSON.parse(args.request) };
	} catch {
		return args;
	}
};

type MastraAutumnTool = {
	description?: string;
	execute?: (args: Record<string, unknown>) => Promise<unknown>;
	mcp?: { annotations?: { destructiveHint?: boolean } };
};

/**
 * Autumn tools as HOST-executed AI SDK tools — the secret stays on our host
 * (never in the sandbox) and destructive tools gate through the harness's
 * first-class `toolApproval` suspend flow. Reuses getAutumnMcpTools so preview
 * capture, progress, and logging behave exactly like the mastra path. Call
 * `disconnect()` when the turn ends.
 */
export const buildAutumnHostTools = async ({
	env,
	logger,
	onAction,
	previewCapture,
	token,
}: {
	env: AppEnv;
	logger?: AutumnLogger;
	onAction?: (message: string) => Promise<void> | void;
	previewCapture?: PreviewCapture;
	token: string;
}): Promise<{
	destructiveTools: Set<string>;
	disconnect: () => Promise<void>;
	tools: ToolSet;
}> => {
	const mcp = createAutumnMcpClient({ appEnv: env, token });
	const mastraTools = (await getAutumnMcpTools({
		mcp,
		options: { logger, onToolCall: onAction, previewCapture },
	})) as Record<string, MastraAutumnTool>;

	const tools: ToolSet = {};
	const destructiveTools = new Set<string>();
	for (const [name, mastraTool] of Object.entries(mastraTools)) {
		const { execute } = mastraTool;
		if (!execute) continue;
		tools[name] = tool({
			description: mastraTool.description ?? name,
			execute: (args: Record<string, unknown>) => execute(normalizeArgs(args)),
			inputSchema: autumnInputSchema,
		});
		if (mastraTool.mcp?.annotations?.destructiveHint === true) {
			destructiveTools.add(name);
		}
	}

	return { destructiveTools, disconnect: () => mcp.disconnect(), tools };
};
