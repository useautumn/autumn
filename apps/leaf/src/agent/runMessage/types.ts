import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv, ChatApproval, ChatProvider } from "@autumn/shared";
import type { ClaudeManagedSessionRef } from "../../harness/claudeManaged/session/ensureSession.js";
import type { ActiveRun } from "../../internal/runs/runRegistry.js";
import type { AgentHarnessName } from "../../lib/chatAgentConfig.js";
import type { AgentOutput, ChatContextMessage } from "../../types.js";
import type { KeyedActionLogger } from "../../ui/progress.js";

/** Leaf's ctx.features analog: what the agent may do, loaded once per message. */
export type AgentToolContext = {
	destructiveTools: Set<string>;
};

export type MessageAttachment = {
	data: Buffer;
	mimeType: string;
	name?: string;
};

export type ThreadRef = {
	channelId: string;
	provider: ChatProvider;
	threadId: string;
	workspaceId: string;
};

/** AutumnContext analog — built up by runMessage setup, complete before an engine runs. */
export type MessageContext = {
	agentTools: AgentToolContext;
	claudeManagedSession?: ClaudeManagedSessionRef;
	/** Epoch ms after which the engine should interrupt the run instead of letting the outer timeout abandon it. */
	deadlineAt?: number;
	env: AppEnv;
	/** Agent run id. */
	id: string;
	logger: AutumnLogger;
	onAction?: (message: string) => Promise<void> | void;
	onActionKeyed?: KeyedActionLogger;
	onApprovalsSuperseded?: (approvals: ChatApproval[]) => Promise<void> | void;
	/** Fires once the managed agent is ready to run its first turn (startup done). */
	onAgentReady?: () => Promise<void> | void;
	/** Fires when the agent starts an inference or emits thinking — drives the live status. */
	onThinking?: () => void;
	/** Posts a drained intermediate turn's text while follow-ups keep the run alive. */
	onTurnComplete?: (text: string) => Promise<void> | void;
	org: { id: string; slug?: string };
	/**
	 * The resolved Autumn user id whose scopes bound this run's token. Set for web
	 * (== providerUserId) and for non-admin Slack senders resolved via their email.
	 * Undefined for Slack admin installs, which keep the installer-scoped flow.
	 */
	autumnUserId?: string;
	providerUserId: string;
	run?: ActiveRun;
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
