import { Hono } from "hono";
import { orgConfigMiddleware } from "@/honoMiddlewares/orgConfigMiddleware.js";
import { secretKeyMiddleware } from "@/honoMiddlewares/secretKeyMiddleware.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

const ALLOWED_ORG_IDS = new Set([
	"org_2rzkkRh7r5dBSaBC101QHG9KDgt",
	"org_2vwdxwTdqxRrLEdUYddcynMv3n3",
]);

export const heapSnapshotRouter = new Hono<HonoEnv>();

heapSnapshotRouter.use("*", secretKeyMiddleware);
heapSnapshotRouter.use("*", orgConfigMiddleware);

heapSnapshotRouter.get("/memory", async (c) => {
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
