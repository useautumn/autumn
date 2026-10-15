import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import {
	LOAD_BALANCER_SETTLE_MS,
	receiveHealth,
} from "../../../src/http/handlers/receiveHealth.js";
import type { AtomHttpContext } from "../../../src/http/types/atomHttp.js";
import { markAtomReady } from "../../../src/init/atomHealth.js";
import { PEER_PROBE_USER_AGENT } from "../../../src/replicas/membership/readyBootOf.js";
import { createThreadStatsBuffer } from "../../../src/threads/stats/threadStats.js";

const LOAD_BALANCER_USER_AGENT = "ELB-HealthChecker/2.0";

const appAt = ({ readyAgoMs }: { readyAgoMs: number | null }) => {
	const health = {
		bootedAt: "2026-10-15T20:00:00.000Z",
		restarts: new Int32Array(new SharedArrayBuffer(4)),
		ready: new Int32Array(new SharedArrayBuffer(4)),
		threadsReady: new Int32Array(new SharedArrayBuffer(4)).fill(1),
		threadStats: createThreadStatsBuffer({ threads: 1 }),
		dataDir: tmpdir(),
		thread: 0,
	};
	const now = Date.now();
	if (readyAgoMs !== null)
		markAtomReady({ ready: health.ready, at: now - readyAgoMs });
	const app = new Hono();
	app.get(
		"/health",
		receiveHealth({ ctx: { health, now: () => now } as unknown as AtomHttpContext }),
	);
	return app;
};

const probe = async ({
	app,
	userAgent,
}: {
	app: Hono;
	userAgent?: string;
}) => {
	const reply = await app.request("/health", {
		headers: userAgent ? { "user-agent": userAgent } : {},
	});
	return { status: reply.status, body: (await reply.json()) as { status: string; settlingUntil?: string } };
};

describe("/health while the load balancer learns a ready replica", () => {
	test("answers the load balancer's checker 200 as soon as the replica is ready", async () => {
		const app = appAt({ readyAgoMs: 1_000 });
		const reply = await probe({ app, userAgent: LOAD_BALANCER_USER_AGENT });
		expect(reply.status).toBe(200);
		expect(reply.body.status).toBe("alive");
	});

	test("answers every other prober 503 until the load balancer has had time to mark the replica healthy, then 200", async () => {
		const settling = await probe({ app: appAt({ readyAgoMs: 1_000 }) });
		expect(settling.status).toBe(503);
		expect(settling.body.status).toBe("alive");
		expect(settling.body.settlingUntil).toBeDefined();

		const settled = await probe({
			app: appAt({ readyAgoMs: LOAD_BALANCER_SETTLE_MS + 1 }),
		});
		expect(settled.status).toBe(200);
		expect(settled.body.settlingUntil).toBeUndefined();
	});

	test("answers a peer's readiness probe 200 as soon as the replica is ready, so a join is not held for the load balancer", async () => {
		const reply = await probe({
			app: appAt({ readyAgoMs: 1_000 }),
			userAgent: PEER_PROBE_USER_AGENT,
		});
		expect(reply.status).toBe(200);
	});

	test("a replica still starting is 503 to everyone", async () => {
		const app = appAt({ readyAgoMs: null });
		expect((await probe({ app, userAgent: LOAD_BALANCER_USER_AGENT })).status).toBe(503);
		expect((await probe({ app })).status).toBe(503);
	});
});
