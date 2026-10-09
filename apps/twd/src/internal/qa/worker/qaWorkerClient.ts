import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

export type WorkerEnvStatus = {
	state: "absent" | "building" | "ready" | "failed" | "expired";
	sha?: string;
	awake: boolean;
	expiresAt?: number;
	lastActiveAt?: number;
	pendingBuild?: {
		buildId: string;
		sha: string;
		startedAt: number;
		progress: {
			phase: string;
			elapsedMs: number;
			remainingMs: number;
			percent: number;
			state?: string;
		} | null;
	};
	lastBuild?: {
		buildId: string;
		sha: string;
		ok: boolean;
		log?: string;
		finishedAt: number;
	};
};

type BeginInput = {
	sha: string;
	ref: string;
	runtimeEnv: Record<string, string>;
	neonBranchId: string;
};

const workerConfig = ({ ctx }: { ctx: TwdContext }) => {
	const { QA_WORKER_URL, QA_ADMIN_TOKEN } = ctx.env;
	if (!QA_WORKER_URL || !QA_ADMIN_TOKEN)
		throw new TwdError({
			status: 503,
			code: "qa_unconfigured",
			message:
				"QA envs are not configured on twd (QA_WORKER_URL / QA_ADMIN_TOKEN).",
			next: "Ask a twd admin to set QA_WORKER_URL and QA_ADMIN_TOKEN.",
		});
	return { url: QA_WORKER_URL.replace(/\/$/, ""), token: QA_ADMIN_TOKEN };
};

const call = async <T>({
	ctx,
	name,
	action,
	init,
	query = "",
	timeoutMs = 120_000,
}: {
	ctx: TwdContext;
	name: string;
	action: string;
	init?: RequestInit & { duplex?: "half" };
	query?: string;
	timeoutMs?: number;
}): Promise<T> => {
	const { url, token } = workerConfig({ ctx });
	const res = await fetch(`${url}/__admin/${name}/${action}${query}`, {
		...init,
		signal: AbortSignal.timeout(timeoutMs),
		headers: { authorization: `Bearer ${token}`, ...init?.headers },
	});
	if (!res.ok)
		throw new TwdError({
			status: res.status === 409 ? 409 : 502,
			code: res.status === 409 ? "qa_name_taken" : "qa_worker_error",
			message: `QA worker ${action} for ${name}: ${res.status} ${(await res.text()).slice(0, 300)}`,
			next:
				res.status === 409
					? "Pick another name."
					: "Retry; if it repeats, check the qa-envs Worker logs.",
		});
	return (await res.json()) as T;
};

/** Thin client for the qa-envs Worker's `/__admin` API (apps/twd/qa-envs). */
export const qaWorker = {
	begin: ({
		ctx,
		name,
		input,
	}: {
		ctx: TwdContext;
		name: string;
		input: BeginInput;
	}) =>
		call<{ buildId: string; publicUrl: string; expiresAt: number }>({
			ctx,
			name,
			action: "begin",
			init: {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(input),
			},
		}),
	uploadSource: ({
		ctx,
		name,
		buildId,
		tarball,
	}: {
		ctx: TwdContext;
		name: string;
		buildId: string;
		tarball: Blob;
	}) =>
		call<{ exitCode: number; bytes: number }>({
			ctx,
			name,
			action: "source",
			query: `?build=${buildId}`,
			init: { method: "POST", body: tarball },
			timeoutMs: 600_000,
		}),
	build: ({
		ctx,
		name,
		buildId,
	}: {
		ctx: TwdContext;
		name: string;
		buildId: string;
	}) =>
		call<{ ok: true }>({
			ctx,
			name,
			action: "build",
			query: `?build=${buildId}`,
			init: { method: "POST" },
		}),
	cancelBuild: ({
		ctx,
		name,
		buildId,
	}: {
		ctx: TwdContext;
		name: string;
		buildId: string;
	}) =>
		call<{ ok: true }>({
			ctx,
			name,
			action: "cancel-build",
			query: `?build=${buildId}`,
			init: { method: "POST" },
		}),
	status: ({ ctx, name }: { ctx: TwdContext; name: string }) =>
		call<WorkerEnvStatus>({ ctx, name, action: "status" }),
	logs: ({
		ctx,
		name,
		service,
		lines,
	}: {
		ctx: TwdContext;
		name: string;
		service: string;
		lines: number;
	}) =>
		call<{ exitCode: number; output: string }>({
			ctx,
			name,
			action: "logs",
			query: `?service=${encodeURIComponent(service)}&lines=${lines}`,
		}),
	exec: ({
		ctx,
		name,
		command,
	}: {
		ctx: TwdContext;
		name: string;
		command: string;
	}) =>
		call<{ exitCode: number; output: string }>({
			ctx,
			name,
			action: "exec",
			init: {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ command }),
			},
			timeoutMs: 300_000,
		}),
	restart: ({ ctx, name }: { ctx: TwdContext; name: string }) =>
		call<{ ready: boolean }>({
			ctx,
			name,
			action: "restart",
			init: { method: "POST" },
		}),
	destroy: ({ ctx, name }: { ctx: TwdContext; name: string }) =>
		call<{ ok: true }>({ ctx, name, action: "", init: { method: "DELETE" } }),
};
