import type { QaEnv } from "./qaEnv/QaEnv";
import type { QaRouter } from "./router/QaRouter";
import type { QaTinybird } from "./tinybird/QaTinybird";

export interface Env {
	QA_ENV: DurableObjectNamespace<QaEnv>;
	QA_ROUTER: DurableObjectNamespace<QaRouter>;
	QA_TINYBIRD: DurableObjectNamespace<QaTinybird>;
	QA_DOMAIN: string;
	NEON_PROJECT_ID: string;
	CLOUDFLARE_ZONE_ID: string;
	QA_ADMIN_TOKEN: string;
	NEON_API_KEY: string;
	CLOUDFLARE_API_TOKEN: string;
	STRIPE_CONNECT_WEBHOOK_SECRET?: string;
	QA_SHARED_ENV?: string;
}

export type CreateEnvInput = {
	sha: string;
	ref?: string;
	runtimeEnv: Record<string, string>;
	neonBranchId?: string;
	ttlMs?: number;
	tinybird?: boolean;
};

export type EnvConfig = CreateEnvInput & {
	name: string;
	publicUrl: string;
	createdAt: number;
	expiresAt: number;
};

export type EnvState = "building" | "ready" | "failed" | "expired";

export type BuildResult = {
	buildId: string;
	sha: string;
	ok: boolean;
	log: string;
	startedAt: number;
	finishedAt: number;
	snapshotBytes?: number;
};

export type QueuedWebhook = { body: string; headers: Record<string, string> };
