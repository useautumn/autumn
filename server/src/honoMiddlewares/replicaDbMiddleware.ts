import type { Context, Next } from "hono";
import { dbReplica } from "@/db/initDrizzle.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { shouldUseReplicaDb } from "@/internal/misc/replicaDb/replicaDbConfigs.js";

export const replicaDbMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	if (!dbReplica) {
		await next();
		return;
	}

	if (shouldUseReplicaDb(c)) {
		const ctx = c.get("ctx");
		ctx.db = dbReplica;
		ctx.useReplicaDb = true;
	}

	await next();
};
