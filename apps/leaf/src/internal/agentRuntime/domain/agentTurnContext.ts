import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv, ChatProvider } from "@autumn/shared";
import type { ActiveRun } from "../../runs/runRegistry.js";
import type { EveSessionRef } from "../eve/types.js";
import type { AgentTurnResult } from "./agentTurn.js";

export type AgentContextMessage = Readonly<{
	author: string;
	isBot: boolean | "unknown";
	text: string;
}>;

export type AgentMissedMessages = Readonly<{
	messages: ReadonlyArray<AgentContextMessage>;
	omittedCount: number;
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

export type AgentActionProgress = Readonly<{
	label: string;
	output?: unknown;
	phase: "completed" | "started";
	status?: string;
	toolName?: string;
}>;

export type AgentTurnContext = Readonly<{
	deadlineAt?: number;
	eveSession?: EveSessionRef;
	env: AppEnv;
	id: string;
	logger: AutumnLogger;
	onAction?: (progress: AgentActionProgress | string) => Promise<void> | void;
	onThinking?: () => void;
	onReasoning?: (input: { id: string; text: string }) => void;
	onTurnResult?: (result: AgentTurnResult) => Promise<void> | void;
	org: { id: string; slug?: string };
	autumnUserId?: string;
	providerUserId: string;
	run?: ActiveRun;
	thread: AgentThreadRef;
	timestamp: number;
	token: string;
}>;

export type PendingApprovalWrite = Readonly<{
	request: Record<string, unknown>;
	toolName: string;
}>;

export type PendingApprovalNote = Readonly<{
	writes: ReadonlyArray<PendingApprovalWrite>;
}>;

export type AgentTurnSpeaker = Readonly<{
	email?: string;
	mentionsAgent?: boolean;
	mentionsOthers?: boolean;
	name: string;
}>;

export type AgentTurnParams = Readonly<{
	attachments?: ReadonlyArray<AgentTurnAttachment>;
	clientContext?: Readonly<Record<string, unknown>>;
	missedMessages?: AgentMissedMessages;
	questionResponse?: { optionId: string; requestId: string };
	recentMessages?: ReadonlyArray<AgentContextMessage>;
	speaker?: AgentTurnSpeaker;
	text: string;
}>;
