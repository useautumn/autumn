import { describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

class FakeRedis extends EventEmitter {
	status: "wait" | "connecting" | "ready" | "end" = "wait";

	setReady() {
		this.status = "ready";
		this.emit("ready");
	}
}

const fakeRedis = new FakeRedis();
const fakeRedisV2 = new FakeRedis();
const fakeLogger = {
	info: mock(() => undefined),
	warn: mock(() => undefined),
	error: mock(() => undefined),
	debug: mock(() => undefined),
	child: mock(() => fakeLogger),
};

await mockModuleWithRestore("@/external/redis/initRedis.js", () => ({
	getMiscRedis: () => fakeRedis,
	hasMiscRedisConfig: true,
}));
await mockModuleWithRestore("@/external/redis/initRedisV2.js", () => ({
	redisV2: fakeRedisV2,
	hasRedisV2Config: true,
}));
await mockModuleWithRestore("@/external/logtail/logtailUtils.js", () => ({
	logger: fakeLogger,
}));

// Cache-busting query: the plain specifier may already be evaluated (initHono
// imports it), and its module-level startup latch would then carry whatever
// state earlier files left behind. A fresh instance evaluates under this
// file's mocks no matter which files ran before.
const { handleHealthCheck } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/honoUtils/handleHealthCheck.js?startupGate"
);

const callHealthCheck = async () => {
	const responses: { status: number; body: string }[] = [];
	const ctx = {
		text: (body: string, status = 200) => {
			responses.push({ status, body });
			return { status, body };
		},
	};
	await handleHealthCheck(
		ctx as unknown as Parameters<typeof handleHealthCheck>[0],
	);
	return responses[0]!;
};

describe("handleHealthCheck startup gate", () => {
	test("returns 503 when both Redis clients are not ready", async () => {
		const res = await callHealthCheck();
		expect(res.status).toBe(503);
		expect(res.body).toBe("Redis not ready");
	});

	test("returns 503 when only one Redis client is ready", async () => {
		fakeRedis.setReady();
		const res = await callHealthCheck();
		expect(res.status).toBe(503);
	});

	test("returns 200 once both Redis clients become ready", async () => {
		fakeRedisV2.setReady();
		const res = await callHealthCheck();
		expect(res.status).toBe(200);
		expect(res.body).toContain("Autumn");
	});

	test("logs a single latch info message on flip", () => {
		expect(fakeLogger.info).toHaveBeenCalledTimes(1);
		const firstCall = fakeLogger.info.mock.calls[0] as unknown as [string];
		expect(firstCall[0]).toContain("[health-check] startup gate latched");
	});

	test("returns 200 unconditionally after latch — even if Redis regresses", async () => {
		fakeRedis.status = "end";
		fakeRedisV2.status = "end";
		const res = await callHealthCheck();
		expect(res.status).toBe(200);
	});
});
