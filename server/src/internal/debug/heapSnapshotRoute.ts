import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { secretKeyMiddleware } from "@/honoMiddlewares/secretKeyMiddleware.js";
import { orgConfigMiddleware } from "@/honoMiddlewares/orgConfigMiddleware.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

const ALLOWED_ORG_IDS = new Set([
	"org_2rzkkRh7r5dBSaBC101QHG9KDgt",
	"org_2vwdxwTdqxRrLEdUYddcynMv3n3",
]);

export const heapSnapshotRouter = new Hono<HonoEnv>();

heapSnapshotRouter.use("*", secretKeyMiddleware);
heapSnapshotRouter.use("*", orgConfigMiddleware);

heapSnapshotRouter.get("/heap-snapshot", async (c) => {
	const ctx = c.get("ctx");

	if (!ALLOWED_ORG_IDS.has(ctx.org?.id)) {
		return c.json({ error: "Forbidden" }, 403);
	}

	// Bun-specific heap snapshot
	if (typeof Bun !== "undefined" && typeof Bun.generateHeapSnapshot === "function") {
		const snapshot = Bun.generateHeapSnapshot();
		return c.json({
			ok: true,
			pid: process.pid,
			timestamp: new Date().toISOString(),
			snapshot,
		});
	}

	// Node.js fallback using v8
	try {
		const v8 = await import("node:v8");
		const snapshotPath = join(tmpdir(), `heap-${process.pid}-${Date.now()}.heapsnapshot`);

		v8.writeHeapSnapshot(snapshotPath);

		const data = readFileSync(snapshotPath);
		unlinkSync(snapshotPath);

		return new Response(data, {
			headers: {
				"Content-Type": "application/json",
				"Content-Disposition": `attachment; filename="heap-${process.pid}-${Date.now()}.heapsnapshot"`,
			},
		});
	} catch (err) {
		return c.json(
			{
				error: "Failed to generate heap snapshot",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

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
