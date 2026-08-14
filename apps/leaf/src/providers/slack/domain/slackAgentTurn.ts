import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv, ChatApproval, ChatInstallation } from "@autumn/shared";
import type { Attachment } from "chat";
import type { AgentTurnResult } from "../../../internal/agentRuntime/domain/agentTurn.js";
import type { AgentContextMessage } from "../../../internal/agentRuntime/domain/agentTurnContext.js";
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
	onAction?: (message: string) => Promise<void> | void;
	onApprovalsSuperseded?: (approvals: ChatApproval[]) => Promise<void> | void;
	onReasoning?: (input: { id: string; text: string }) => void;
	onThinking?: () => void;
	providerUserId: string;
	recentMessages?: ReadonlyArray<AgentContextMessage>;
	run?: ActiveRun;
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
