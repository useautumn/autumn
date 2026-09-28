import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv, ChatInstallation } from "@autumn/shared";
import type { Attachment } from "chat";
import type { AgentTurnResult } from "../../../internal/agentRuntime/domain/agentTurn.js";
import type {
	AgentActionProgress,
	AgentContextMessage,
	AgentMissedMessages,
	AgentTurnSpeaker,
} from "../../../internal/agentRuntime/domain/agentTurnContext.js";
import type { ActiveRun } from "../../../internal/runs/runRegistry.js";

export type SlackChatInstallation = ChatInstallation & {
	org_slug?: string;
};

export type SlackAgentTurnParams = Readonly<{
	agentRunId?: string;
	attachmentFetchFallback?: (params: {
		attachment: Attachment;
	}) => Promise<Buffer | null>;
	attachments?: ReadonlyArray<Attachment>;
	channelId: string;
	clientContext?: Readonly<Record<string, unknown>>;
	installation: SlackChatInstallation;
	logger?: AutumnLogger;
	missedMessages?: AgentMissedMessages;
	onAction?: (progress: AgentActionProgress | string) => Promise<void> | void;
	onReasoning?: (input: { id: string; text: string }) => void;
	/** Receives a turn that settled while a follow-up was still to be read, so
	 * its reply is posted before the reader moves on to the replacement. */
	onSettledTurn?: (turn: SlackAgentTurnResult) => Promise<void> | void;
	onThinking?: () => void;
	providerUserId: string;
	recentMessages?: ReadonlyArray<AgentContextMessage>;
	run?: ActiveRun;
	speaker?: AgentTurnSpeaker;
	text: string;
	threadId: string;
}>;

export type SlackAgentTurnResult =
	| Readonly<{ env: AppEnv; kind: "blocked"; text: string }>
	| (AgentTurnResult &
			Readonly<{
				env: AppEnv;
				installation: SlackChatInstallation;
				org: { id: string; slug?: string };
			}>);
