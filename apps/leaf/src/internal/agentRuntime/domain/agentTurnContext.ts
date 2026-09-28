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

/** Thread messages the agent never received because they did not tag it,
 * handed to the next turn that does; `omittedCount` older ones did not fit. */
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
	/** Delivers a turn that settled while a follow-up was still to be read, so
	 * its reply reaches the thread before the reader moves on. The turn's final
	 * result is returned as usual and never repeated here. */
	onTurnResult?: (result: AgentTurnResult) => Promise<void> | void;
	org: { id: string; slug?: string };
	autumnUserId?: string;
	providerUserId: string;
	run?: ActiveRun;
	thread: AgentThreadRef;
	timestamp: number;
	token: string;
}>;

/** One write on a pending approval card: the tool and the exact request
 * body the model issued, as the model would call it again. */
export type PendingApprovalWrite = Readonly<{
	request: Record<string, unknown>;
	toolName: string;
}>;

/** A card still awaiting the user's decision — its writes in execution order. */
export type PendingApprovalNote = Readonly<{
	writes: ReadonlyArray<PendingApprovalWrite>;
}>;

/** Who sent this turn's message and whom it addresses, so the model can tell
 * a request for it from chatter between people in the thread. */
export type AgentTurnSpeaker = Readonly<{
	email?: string;
	/** The message @-mentions this agent. */
	mentionsAgent?: boolean;
	/** The message @-mentions someone other than this agent. */
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
