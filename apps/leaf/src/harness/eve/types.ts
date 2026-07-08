import type { AppEnv } from "@autumn/shared";
import { z } from "zod";

export const eveSessionStateSchema = z.strictObject({
	version: z.literal(1),
	continuationToken: z.string().min(1),
	streamIndex: z.number().int().nonnegative(),
	status: z
		.enum(["running", "waiting", "completed", "failed"])
		.default("running"),
	lastEventAt: z.number().int().nonnegative(),
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
	/** Resolved Autumn dashboard user (per-user OAuth credential owner). Absent
	 * for legacy/admin callers, which fall back to the installer's credential. */
	autumnUserId?: string;
	channelId: string;
	chatInstallationId?: string;
	orgId: string;
	provider: string;
	providerUserId: string;
	threadId: string;
	workspaceId: string;
};

export type EveRuntimeSession = EveSessionRef & {
	auth: EveAuthContext;
};
