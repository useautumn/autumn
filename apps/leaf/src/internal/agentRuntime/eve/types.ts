import type { AppEnv } from "@autumn/shared";
import { z } from "zod";

export const evePendingRequestSchema = z.strictObject({
	denyOptionId: z.string().optional(),
	kind: z.enum(["gated", "question"]),
	requestId: z.string().min(1),
});

export type EvePendingRequest = z.infer<typeof evePendingRequestSchema>;

// Non-strict so rows written before a field was retired still parse; a strict
// object would fail them all and silently restart every live thread.
export const eveSessionStateSchema = z.object({
	streamIndex: z.number().int().nonnegative(),
	pendingRequests: z.array(evePendingRequestSchema).default([]),
});

export type EveSessionState = z.infer<typeof eveSessionStateSchema>;

export type EveSessionRef = {
	env: AppEnv;
	newSession: boolean;
	sessionId: string;
	state: EveSessionState;
	threadKey: string;
};

export type EveAuthContext = {
	appEnv: AppEnv | string;
	autumnUserId?: string;
	channelId: string;
	chatInstallationId?: string;
	orgId: string;
	orgInstructions?: string;
	provider: string;
	providerUserId: string;
	threadId: string;
	workspaceId: string;
};
