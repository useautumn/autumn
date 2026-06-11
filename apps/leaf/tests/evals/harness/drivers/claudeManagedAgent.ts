import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppEnv } from "@autumn/shared";
import { MCPClient } from "@mastra/mcp";
import { autumnChatInstructions } from "../../../../src/agent/prompts/instructions.js";
import { agentDocUris } from "../../../../src/agent/prompts/readDocs.js";
import { createClaudeCodeHarness } from "../../../../src/harness/index.js";
import type {
	HarnessAttachment,
	HarnessSession,
	HarnessToolCall,
	HarnessUserMessage,
} from "../../../../src/harness/types.js";
import { defaultGenericMcpAgentConfig } from "../configs/genericMcpAgentConfig.js";
import type {
	EvalAgentDriver,
	EvalDriverMessage,
	EvalDriverStartInput,
	EvalToolCall,
} from "./types.js";

type ClaudeManagedAgentDriverConfig = {
	builtinTools?: "all" | "web-only" | "none";
	maxTurns?: number;
	model?: string;
};

const harness = createClaudeCodeHarness();

const readDocs = async (mcpClient: MCPClient) => {
	const resources = await Promise.allSettled(
		agentDocUris.map((uri) => mcpClient.resources.read("autumn", uri)),
	);
	return resources
		.flatMap((result) =>
			result.status === "fulfilled"
				? result.value.contents.flatMap((content) =>
						"text" in content ? [content.text] : [],
					)
				: [],
		)
		.join("\n\n");
};

// The eval MCP server injects auth server-side, so a bare client is enough here.
const loadMcpMetadata = async ({ url }: { url: URL }) => {
	const mcpClient = new MCPClient({
		id: `claude-code-eval-${crypto.randomUUID()}`,
		servers: { autumn: { url } },
	});
	try {
		const [{ toolsets, errors }, docsText] = await Promise.all([
			mcpClient.listToolsetsWithErrors(),
			readDocs(mcpClient),
		]);
		if (Object.keys(errors).length) {
			throw new Error(`MCP tool discovery failed: ${JSON.stringify(errors)}`);
		}
		const tools = (toolsets.autumn ?? {}) as Record<
			string,
			{ mcp?: { annotations?: { destructiveHint?: boolean } } }
		>;
		const destructiveTools = new Set(
			Object.entries(tools)
				.filter(([, tool]) => tool.mcp?.annotations?.destructiveHint === true)
				.map(([name]) => name),
		);
		return { destructiveTools, docsText };
	} finally {
		await mcpClient.disconnect();
	}
};

type MessagePart = {
	data?: Buffer;
	filename?: string;
	mediaType?: string;
	text?: string;
	type: string;
};

const toHarnessMessage = (input: EvalDriverMessage): HarnessUserMessage => {
	if (typeof input === "string") return { text: input };
	const attachments: HarnessAttachment[] = [];
	const texts: string[] = [];
	for (const item of input as Array<{ content: unknown; role?: string }>) {
		if (typeof item.content === "string") {
			texts.push(item.content);
			continue;
		}
		if (!Array.isArray(item.content)) continue;
		for (const part of item.content as MessagePart[]) {
			if (part.type === "text" && part.text) texts.push(part.text);
			if (part.type === "file" && part.data && part.mediaType) {
				attachments.push({
					data: part.data,
					mimeType: part.mediaType,
					name: part.filename,
				});
			}
		}
	}
	return { attachments, text: texts.join("\n\n") };
};

export const createClaudeManagedAgentDriver = ({
	builtinTools = "all",
	maxTurns = defaultGenericMcpAgentConfig.maxSteps,
	model = defaultGenericMcpAgentConfig.model,
}: ClaudeManagedAgentDriverConfig = {}): EvalAgentDriver => ({
	name: "claude-managed",
	start: async ({ context, today, trace }: EvalDriverStartInput) => {
		const { destructiveTools, docsText } = await loadMcpMetadata({
			url: context.mcpServer.url,
		});
		const env = context.auth.env === AppEnv.Live ? AppEnv.Live : AppEnv.Sandbox;

		const base = await mkdtemp(join(tmpdir(), "leaf-eval-harness-"));
		const toolCalls: EvalToolCall[] = [];
		let pendingApproval: ({ id: string } & HarnessToolCall) | undefined;
		// One-shot allowances so an approved tool executes on the post-approval retry.
		const approvalGrants = new Set<string>();

		const session: HarnessSession = await harness.createSession({
			builtinTools,
			maxTurns,
			mcpServers: { autumn: { url: context.mcpServer.url.href } },
			model: model.replace(/^anthropic\//, ""),
			requiresApproval: (tool) => {
				if (tool.mcpServer !== "autumn") return false;
				if (approvalGrants.delete(tool.name)) return false;
				return destructiveTools.has(tool.name);
			},
			systemPrompt: [
				autumnChatInstructions,
				`Current Autumn environment: ${env}.`,
				today ? `Current date: ${today.toISOString()}.` : null,
				docsText,
			]
				.filter((section): section is string => Boolean(section))
				.join("\n\n"),
			workspace: {
				configDir: process.env.ANTHROPIC_API_KEY
					? join(base, "config")
					: undefined,
				cwd: join(base, "work"),
			},
		});

		const runTurn = async (message: HarnessUserMessage) => {
			pendingApproval = undefined;
			const textParts: string[] = [];
			let errorMessage: string | undefined;
			for await (const event of session.send(message)) {
				if (event.type === "text") {
					textParts.push(event.text);
				} else if (event.type === "tool_call") {
					const call = { args: event.input, name: event.name };
					toolCalls.push(call);
					trace.event({ call, type: "tool_call" });
				} else if (event.type === "approval_required") {
					pendingApproval = event;
				} else if (event.type === "error") {
					errorMessage = event.message;
				}
			}
			if (pendingApproval) trace.event({ type: "approval_pending" });
			const text = textParts.join("\n\n");
			if (errorMessage && !text && !pendingApproval) {
				throw new Error(`Claude-managed eval turn failed: ${errorMessage}`);
			}
			trace.event({ text, type: "agent_text" });
			return { text };
		};

		return {
			approve: async () => {
				if (!pendingApproval) {
					throw new Error("No pending approval to approve.");
				}
				trace.event({ type: "approval_approved" });
				const approved = pendingApproval;
				approvalGrants.add(approved.name);
				return runTurn({
					text: `Approved. Execute the pending ${approved.name} action now with exactly the same arguments. Do not preview again or ask for confirmation.`,
				});
			},
			cleanup: async () => {
				await session.close();
				await rm(base, { force: true, recursive: true });
			},
			getToolCalls: () => [...toolCalls],
			hasPendingApproval: () => pendingApproval !== undefined,
			send: async (message) => runTurn(toHarnessMessage(message)),
		};
	},
});

export type { ClaudeManagedAgentDriverConfig };
