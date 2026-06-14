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
		const suspendPayload = payload.suspendPayload as
			| Record<string, unknown>
			| undefined;
		const previewApproval = payload.previewApproval as
			| Record<string, unknown>
			| undefined;
		return {
			text: payload.text,
			env: payload.env,
			finishReason: payload.finishReason,
			stopReason: payload.stopReason,
			runId: payload.runId,
			suspendPayload: suspendPayload && {
				toolCallId: suspendPayload.toolCallId,
				toolName: suspendPayload.toolName,
				args: suspendPayload.args,
			},
			previewApproval: previewApproval && {
				toolName: previewApproval.toolName,
				toolArgs: previewApproval.toolArgs,
				preview: previewApproval.preview,
			},
		};
	},
	z.strictObject({
		text: z.string().optional(),
		env: z.nativeEnum(AppEnv),
		finishReason: z.string().optional(),
		stopReason: z.enum(["timeout", "user"]).optional(),
		runId: z.string().optional(),
		suspendPayload: z
			.strictObject({
				toolCallId: z.string().optional(),
				toolName: z.string(),
				args: z.record(z.string(), z.unknown()).optional(),
			})
			.optional(),
		previewApproval: z
			.strictObject({
				toolName: z.string(),
				toolArgs: z.record(z.string(), z.unknown()),
				preview: z.unknown(),
			})
			.optional(),
	}),
);

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
