import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv, ChatApproval, ChatProvider } from "@autumn/shared";
import type { EveSessionRef } from "../../harness/eve/types.js";
import type { ActiveRun } from "../../internal/runs/runRegistry.js";
import type { ChatContextMessage } from "../../types.js";

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
	eveSession?: EveSessionRef;
	env: AppEnv;
	/** Agent run id. */
	id: string;
	logger: AutumnLogger;
	onAction?: (message: string) => Promise<void> | void;
	onApprovalsSuperseded?: (approvals: ChatApproval[]) => Promise<void> | void;
	/** Fires when the agent starts an inference or emits thinking — drives the live status. */
	onThinking?: () => void;
	/** Streams process narration into dashboard work history. */
	onReasoning?: (input: { id: string; text: string }) => void;
	org: { id: string; slug?: string };
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
	/** Structured, non-persisted context for this turn only. */
	clientContext?: Record<string, unknown>;
	/** A clicked answer chip for a pending ask_question — answered via eve's
	 * structured inputResponses, since wrapped message text never matches. */
	questionResponse?: { optionId: string; requestId: string };
	recentMessages?: ChatContextMessage[];
	text: string;
};
