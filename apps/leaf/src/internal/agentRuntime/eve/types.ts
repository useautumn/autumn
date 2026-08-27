import type { AppEnv } from "@autumn/shared";
import { z } from "zod";

export const evePendingRequestSchema = z.strictObject({
	denyOptionId: z.string().optional(),
	kind: z.enum(["gated", "question"]),
	requestId: z.string().min(1),
});

export type EvePendingRequest = z.infer<typeof evePendingRequestSchema>;

export const eveSessionStateSchema = z.strictObject({
	version: z.literal(1),
	continuationToken: z.string().min(1),
	streamIndex: z.number().int().nonnegative(),
	status: z
		.enum(["running", "waiting", "completed", "failed"])
		.default("running"),
	lastEventAt: z.number().int().nonnegative(),
	// Parks eve is waiting on. A message posted while any gated park is open is
	// silently deferred by eve, so these must be answered before every post.
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
	orgCatalog?: string;
	orgId: string;
	orgInstructions?: string;
	provider: string;
	providerUserId: string;
	threadId: string;
	workspaceId: string;
};

export type EveRuntimeSession = EveSessionRef & {
	auth: EveAuthContext;
};
