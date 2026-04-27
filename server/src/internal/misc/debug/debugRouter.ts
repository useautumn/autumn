import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { dbCritical, dbGeneral } from "@/db/initDrizzle.js";
import {
	forceDegraded,
	forceHealthy,
	getPgHealthState,
} from "@/db/pgHealthMonitor.js";
import { redis } from "@/external/redis/initRedis.js";
import {
	disconnectPrimary,
	getFailoverState,
	reconnectPrimary,
} from "@/external/redis/redisFailover.js";
import { orgConfigMiddleware } from "@/honoMiddlewares/orgConfigMiddleware.js";
import { secretKeyMiddleware } from "@/honoMiddlewares/secretKeyMiddleware.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

const ALLOWED_ORG_IDS = new Set([
	"org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt",
	"org_2rzkkRh7r5dBSaBC101QHG9KDgt",
	"org_2vwdxwTdqxRrLEdUYddcynMv3n3",
]);

export const debugRouter = new Hono<HonoEnv>();

debugRouter.use("*", secretKeyMiddleware);
debugRouter.use("*", orgConfigMiddleware);

debugRouter.get("/memory", async (c) => {
	const ctx = c.get("ctx");

	if (!ALLOWED_ORG_IDS.has(ctx.org?.id)) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const mem = process.memoryUsage();

	return c.json({
		ok: true,
		pid: process.pid,
		timestamp: new Date().toISOString(),
		memory: {
			rssMB: +(mem.rss / 1024 / 1024).toFixed(1),
			heapUsedMB: +(mem.heapUsed / 1024 / 1024).toFixed(1),
			heapTotalMB: +(mem.heapTotal / 1024 / 1024).toFixed(1),
			externalMB: +(mem.external / 1024 / 1024).toFixed(1),
			arrayBuffersMB: +(mem.arrayBuffers / 1024 / 1024).toFixed(1),
		},
	});
});

/** Check what statement_timeout the DB connections actually see. */
debugRouter.get("/statement-timeout", async (c) => {
	if (process.env.NODE_ENV === "production") {
		return c.json({ error: "Not available in production" }, 403);
	}

	const ctx = c.get("ctx");
	if (!ALLOWED_ORG_IDS.has(ctx.org?.id)) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const criticalResult = await dbCritical.execute(sql`SHOW statement_timeout`);
	const generalResult = await dbGeneral.execute(sql`SHOW statement_timeout`);

	return c.json({
		ok: true,
		critical: criticalResult[0],
		general: generalResult[0],
	});
});

/**
 * Pool isolation test endpoint. Runs pg_sleep or SELECT 1 on a specific pool.
 * Blocked in production.
 */
debugRouter.post("/pool-test", async (c) => {
	if (process.env.NODE_ENV === "production") {
		return c.json({ error: "Not available in production" }, 403);
	}

	const ctx = c.get("ctx");
	if (!ALLOWED_ORG_IDS.has(ctx.org?.id)) {
		return c.json({ error: "Forbidden" }, 403);
	}

	if (process.env.DATABASE_V2_URL?.includes("us-east-2")) {
		return c.json({ error: "Not available against production database" }, 403);
	}

	const body = await c.req.json<{
		action: "sleep" | "ping" | "cpu";
		pool: "general" | "critical";
		seconds?: number;
		/** Row count for CPU burn (default 5_000_000). Higher = more CPU time. */
		rows?: number;
	}>();

	const { action, pool, seconds = 5, rows = 5_000_000 } = body;
	const db = pool === "critical" ? dbCritical : dbGeneral;
	const start = Date.now();

	try {
		if (action === "sleep") {
			await db.execute(sql`SELECT pg_sleep(${seconds})`);
		} else if (action === "cpu") {
			// CPU-intensive: hash millions of rows. Burns real CPU on the DB.
			await db.execute(
				sql`SELECT count(*) FROM generate_series(1, ${rows}) AS s WHERE md5(s::text) IS NOT NULL`,
			);
		} else {
			await db.execute(sql`SELECT 1`);
		}

		return c.json({
			ok: true,
			pool,
			action,
			durationMs: Date.now() - start,
		});
	} catch (error) {
		return c.json({
			ok: false,
			pool,
			action,
			durationMs: Date.now() - start,
			error: error instanceof Error ? error.message : String(error),
		});
	}
});

/**
 * Redis failover test endpoints. Blocked in production.
 */
debugRouter.post("/redis-failover", async (c) => {
	if (process.env.NODE_ENV === "production") {
		return c.json({ error: "Not available in production" }, 403);
	}

	const ctx = c.get("ctx");

	if (!ALLOWED_ORG_IDS.has(ctx.org?.id)) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const body = await c.req.json<{
		action: "status" | "kill-primary" | "recover-primary" | "ping";
	}>();

	if (body.action === "status") {
		return c.json({ ok: true, ...getFailoverState() });
	}

	if (body.action === "kill-primary") {
		disconnectPrimary();
		return c.json({ ok: true, message: "Primary disconnected" });
	}

	if (body.action === "recover-primary") {
		reconnectPrimary();
		return c.json({ ok: true, message: "Primary reconnect triggered" });
	}

	if (body.action === "ping") {
		const start = Date.now();
		try {
			await redis.ping();
			return c.json({
				ok: true,
				durationMs: Date.now() - start,
				...getFailoverState(),
			});
		} catch (error) {
			return c.json({
				ok: false,
				durationMs: Date.now() - start,
				error: error instanceof Error ? error.message : String(error),
				...getFailoverState(),
			});
		}
	}

	return c.json({ error: "Unknown action" }, 400);
});

/**
 * PG health monitor test endpoints. Blocked in production.
 */
debugRouter.post("/pg-health", async (c) => {
	if (process.env.NODE_ENV === "production") {
		return c.json({ error: "Not available in production" }, 403);
	}

	const ctx = c.get("ctx");
	if (!ALLOWED_ORG_IDS.has(ctx.org?.id)) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const body = await c.req.json<{
		action: "status" | "force-degraded" | "force-healthy";
	}>();

	if (body.action === "status") {
		return c.json({ ok: true, ...getPgHealthState() });
	}

	if (body.action === "force-degraded") {
		forceDegraded();
		return c.json({
			ok: true,
			message: "Forced DEGRADED",
			...getPgHealthState(),
		});
	}

	if (body.action === "force-healthy") {
		forceHealthy();
		return c.json({
			ok: true,
			message: "Forced HEALTHY",
			...getPgHealthState(),
		});
	}

	return c.json({ error: "Unknown action" }, 400);
});

/** Write a V8 heap snapshot to disk. Requires secret key auth + dev-only. */
// debugRouter.get("/heap-snapshot", async (c) => {
// 	if (process.env.NODE_ENV === "production") {
// 		return c.json({ error: "Not available in production" }, 403);
// 	}

// 	const ctx = c.get("ctx");
// 	if (!ALLOWED_ORG_IDS.has(ctx.org?.id)) {
// 		return c.json({ error: "Forbidden" }, 403);
// 	}

// 	const snapshotDir = new URL("../../../perf/snapshots/", import.meta.url)
// 		.pathname;
// 	const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
// 	const filename = `heap-${timestamp}-pid${process.pid}.heapsnapshot`;
// 	const filepath = `${snapshotDir}${filename}`;

// 	writeHeapSnapshot(filepath);

// 	return c.json({ ok: true, file: filename, path: filepath });
// });
