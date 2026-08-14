import type { AutumnLogger } from "@autumn/logging";
import { type ChatApproval, type ChatInstallation } from "@autumn/shared";
import type { Attachment } from "chat";
import type { ActiveRun } from "./internal/runs/runRegistry.js";

export type LeafChatInstallation = ChatInstallation & {
	org_slug?: string;
};

export type SignatureArgs = {
	body: string;
	timestamp?: string | null;
	signature?: string | null;
};

export type BotMessage = {
	agentRunId?: string;
	attachmentFetchFallback?: (params: {
		attachment: Attachment;
	}) => Promise<Buffer | null>;
	attachments?: Attachment[];
	/** One-turn structured context (e.g. a submitted catalog decision card). */
	clientContext?: Record<string, unknown>;
	installation: LeafChatInstallation;
	logger?: AutumnLogger;
	onAction?: (message: string) => Promise<void> | void;
	onApprovalsSuperseded?: (approvals: ChatApproval[]) => Promise<void> | void;
	/** Fires when the agent starts an inference or emits thinking — drives the live status. */
	onThinking?: () => void;
	/** Streams interim narration (message deltas before the final reply). */
	onReasoning?: (input: { id: string; text: string }) => void;
	providerUserId: string;
	run?: ActiveRun;
	recentMessages?: ChatContextMessage[];
	text: string;
	channelId: string;
	threadId: string;
};

export type ChatContextMessage = {
	author: string;
	isBot: boolean | "unknown";
	text: string;
};
