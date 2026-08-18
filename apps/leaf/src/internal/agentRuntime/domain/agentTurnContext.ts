import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv, ChatApproval, ChatProvider } from "@autumn/shared";
import type { ActiveRun } from "../../runs/runRegistry.js";
import type { EveSessionRef } from "../eve/types.js";

export type AgentContextMessage = Readonly<{
	author: string;
	isBot: boolean | "unknown";
	text: string;
}>;

export type AgentTurnAttachment = Readonly<{
	data: Buffer;
	mimeType: string;
	name?: string;
}>;

export type AgentThreadRef = Readonly<{
	channelId: string;
	provider: ChatProvider;
	threadId: string;
	workspaceId: string;
}>;

export type AgentTurnContext = Readonly<{
	eveSession?: EveSessionRef;
	env: AppEnv;
	id: string;
	logger: AutumnLogger;
	onAction?: (message: string) => Promise<void> | void;
	onApprovalsSuperseded?: (approvals: ChatApproval[]) => Promise<void> | void;
	onThinking?: () => void;
	onReasoning?: (input: { id: string; text: string }) => void;
	org: { id: string; slug?: string };
	autumnUserId?: string;
	providerUserId: string;
	run?: ActiveRun;
	thread: AgentThreadRef;
	timestamp: number;
	token: string;
}>;

export type AgentTurnParams = Readonly<{
	attachments?: ReadonlyArray<AgentTurnAttachment>;
	clientContext?: Readonly<Record<string, unknown>>;
	questionResponse?: { optionId: string; requestId: string };
	recentMessages?: ReadonlyArray<AgentContextMessage>;
	text: string;
}>;
