import type { z } from "zod";
import { loopbackHost } from "./primitives.js";

type WorkerEnvShape = {
	BALANCE_WORKER_CHECKPOINT_MODE: string;
	BALANCE_WORKER_CHECKPOINT_BUCKET?: string;
	BALANCE_WORKER_CHECKPOINT_REGION?: string;
	BALANCE_WORKER_SQLITE_PATH: string;
	BALANCE_WORKER_ENDPOINT?: string;
	BALANCE_WORKER_HOST: string;
	BALANCE_WORKER_PORT: number;
};

/** The rules that span variables: what one setting requires of another. */
export function validateBalanceWorkerEnv(
	env: WorkerEnvShape,
	context: z.RefinementCtx,
): void {
	if (env.BALANCE_WORKER_CHECKPOINT_MODE !== "off") {
		for (const name of [
			"BALANCE_WORKER_CHECKPOINT_BUCKET",
			"BALANCE_WORKER_CHECKPOINT_REGION",
		] as const) {
			if (!env[name])
				context.addIssue({
					code: "custom",
					path: [name],
					message: "is required when checkpoint mode is not off",
				});
		}
		if (env.BALANCE_WORKER_SQLITE_PATH === ":memory:")
			context.addIssue({
				code: "custom",
				path: ["BALANCE_WORKER_SQLITE_PATH"],
				message: "S3 checkpoints require a file-backed SQLite database",
			});
	}
	if (env.BALANCE_WORKER_ENDPOINT) {
		const url = new URL(env.BALANCE_WORKER_ENDPOINT);
		const host = url.hostname.replace(/^\[|\]$/g, "");
		if (
			url.protocol !== "http:" ||
			!loopbackHost.safeParse(host).success ||
			url.hostname !==
				(env.BALANCE_WORKER_HOST === "::1"
					? "[::1]"
					: env.BALANCE_WORKER_HOST) ||
			url.username ||
			url.password ||
			url.pathname !== "/" ||
			url.search ||
			url.hash ||
			Number(url.port || 80) !== env.BALANCE_WORKER_PORT
		)
			context.addIssue({
				code: "custom",
				path: ["BALANCE_WORKER_ENDPOINT"],
				message: "must be a loopback HTTP origin on the listener port",
			});
	}
}
