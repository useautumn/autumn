import type { QaEnv } from "./qaEnv/QaEnv";
import type { QaRouter } from "./router/QaRouter";

export interface Env {
	QA_ENV: DurableObjectNamespace<QaEnv>;
	QA_ROUTER: DurableObjectNamespace<QaRouter>;
	QA_DOMAIN: string;
	NEON_PROJECT_ID: string;
	CLOUDFLARE_ZONE_ID: string;
	QA_ADMIN_TOKEN: string;
	NEON_API_KEY: string;
	/** Zone DNS:Edit + Workers Routes:Edit on QA_DOMAIN, for per-env hostnames. */
	CLOUDFLARE_API_TOKEN: string;
	STRIPE_CONNECT_WEBHOOK_SECRET?: string;
	/** JSON object of shared Capy project keys; filtered by SHARED_ENV_KEYS. */
	QA_SHARED_ENV?: string;
}

/** What twd sends to create or re-ship an env. */
export type CreateEnvInput = {
	sha: string;
	ref?: string;
	/** DATABASE_URL plus the Capy machine's BETTER_AUTH_SECRET / ENCRYPTION_IV / ENCRYPTION_PASSWORD. */
	runtimeEnv: Record<string, string>;
	neonBranchId?: string;
	ttlMs?: number;
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
