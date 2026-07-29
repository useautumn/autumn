import type { AutumnLogger } from "@autumn/logging";
import {
	AppEnv,
	type ChatApproval,
	type ChatInstallation,
} from "@autumn/shared";
import type { Attachment } from "chat";
import { z } from "zod";
import type { ActiveRun } from "./internal/runs/runRegistry.js";

export type LeafChatInstallation = ChatInstallation & {
	org_slug?: string;
};

export const agentOutputSchema = z.preprocess(
	(value) => {
		const payload =
			value && typeof value === "object"
				? (value as Record<string, unknown>)
				: {};
		const suspension = payload.suspension as
			| Record<string, unknown>
			| undefined;
		const catalogDecision = payload.catalogDecision as
			| Record<string, unknown>
			| undefined;
		const question = payload.question as Record<string, unknown> | undefined;
		return {
			text: payload.text,
			env: payload.env,
			finishReason: payload.finishReason,
			stopReason: payload.stopReason,
			runId: payload.runId,
			suspension: suspension && {
				toolCallId: suspension.toolCallId,
				toolName: suspension.toolName,
				toolArgs: suspension.toolArgs,
				preview: suspension.preview,
			},
			catalogDecision: catalogDecision && {
				plan: catalogDecision.plan,
			},
			question: question && {
				prompt: question.prompt,
				options: question.options,
				requestId: question.requestId,
			},
		};
	},
	z.strictObject({
		text: z.string().optional(),
		env: z.nativeEnum(AppEnv),
		finishReason: z.string().optional(),
		stopReason: z.enum(["timeout", "user"]).optional(),
		runId: z.string().optional(),
		// Set when the agent paused on a destructive write awaiting approval.
		suspension: z
			.strictObject({
				toolCallId: z.string().optional(),
				toolName: z.string(),
				toolArgs: z.record(z.string(), z.unknown()),
				preview: z.unknown(),
			})
			.optional(),
		// Set when `previewUpdateCatalog` returned a plan that needs a
		// versioning/variant/migration decision before the write can run.
		catalogDecision: z
			.strictObject({
				plan: z.unknown(),
			})
			.optional(),
		// Set when the agent paused on ask_question with structured options;
		// `text` still carries the flat prompt+options for text-only surfaces.
		question: z
			.strictObject({
				prompt: z.string(),
				requestId: z.string(),
				options: z.array(
					z.strictObject({
						id: z.string().optional(),
						label: z.string().optional(),
					}),
				),
			})
			.optional(),
	}),
);

export type Suspension = NonNullable<
	z.infer<typeof agentOutputSchema>["suspension"]
>;

export type AgentOutput = z.infer<typeof agentOutputSchema>;

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
	onActionKeyed?: (input: {
		key: string;
		message: string;
	}) => Promise<void> | void;
	onApprovalsSuperseded?: (approvals: ChatApproval[]) => Promise<void> | void;
	/** Fires once the managed agent is ready to run its first turn (startup done). */
	onAgentReady?: () => Promise<void> | void;
	/** Fires when the agent starts an inference or emits thinking — drives the live status. */
	onThinking?: () => void;
	/** Streams interim narration (message deltas before the final reply). */
	onReasoning?: (input: { id: string; text: string }) => void;
	onTurnComplete?: (text: string) => Promise<void> | void;
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
