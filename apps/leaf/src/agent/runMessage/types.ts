import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import type { AgentHarnessName } from "../../lib/chatAgentConfig.js";
import type { AgentOutput, ChatContextMessage } from "../../types.js";

/** Leaf's ctx.features analog: what the agent may do, loaded once per message. */
export type AgentToolContext = {
	destructiveTools: Set<string>;
	docsText: string;
};

export type MessageAttachment = {
	data: Buffer;
	mimeType: string;
	name?: string;
};

export type ThreadRef = {
	channelId: string;
	provider: string;
	threadId: string;
	workspaceId: string;
};

/** AutumnContext analog — built up by runMessage setup, complete before an engine runs. */
export type MessageContext = {
	agentTools: AgentToolContext;
	env: AppEnv;
	/** Agent run id. */
	id: string;
	logger: AutumnLogger;
	onAction?: (message: string) => Promise<void> | void;
	org: { id: string; slug?: string };
	thread: ThreadRef;
	timestamp: number;
	/** Org+env OAuth access token used for Autumn MCP auth. */
	token: string;
};

/** The request payload (billing's params analog). */
export type MessageParams = {
	attachments?: MessageAttachment[];
	recentMessages?: ChatContextMessage[];
	text: string;
};

export type AgentEngine = {
	name: AgentHarnessName;
	run(input: {
		ctx: MessageContext;
		params: MessageParams;
	}): Promise<AgentOutput>;
};
