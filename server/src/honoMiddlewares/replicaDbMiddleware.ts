import type { Context, Next } from "hono";
import { dbReplica, dbReplicaSlow } from "@/db/initDrizzle.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { resolveReplicaDbLane } from "@/internal/misc/replicaDb/replicaDbConfigs.js";

export const replicaDbMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	if (!dbReplica) {
		await next();
		return;
	}

	const lane = await resolveReplicaDbLane({
		method: c.req.method,
		path: c.req.path,
		readBody: () => c.req.json(),
	});

	if (lane) {
		const ctx = c.get("ctx");
		ctx.db = lane === "slow" ? (dbReplicaSlow ?? dbReplica) : dbReplica;
		ctx.useReplicaDb = true;
	}

	await next();
};
