import type { AutumnLogger } from "@autumn/logging";
import { AppEnv, type ChatInstallation } from "@autumn/shared";
import type { Attachment } from "chat";
import { z } from "zod";

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
	attachmentFetchFallback?: (params: {
		attachment: Attachment;
	}) => Promise<Buffer | null>;
	attachments?: Attachment[];
	installation: ChatInstallation;
	logger?: AutumnLogger;
	onAction?: (message: string) => Promise<void> | void;
	recentMessages?: ChatContextMessage[];
	text: string;
	threadId: string;
};

export type ChatContextMessage = {
	author: string;
	isBot: boolean | "unknown";
	text: string;
};
