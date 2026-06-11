import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

export type ClaudeCodeContentBlocks = Extract<
	SDKUserMessage["message"]["content"],
	unknown[]
>[number][];

export type ParsedToolName = { mcpServer?: string; name: string };
