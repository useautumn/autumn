import { describe, expect, test } from "bun:test";
import {
	evaluateStartupGate,
	STARTUP_GATE_MAX_WAIT_MS,
} from "@/honoUtils/handleHealthCheck.js";

describe("evaluateStartupGate", () => {
	test("not ready while Redis is down and max-wait has not elapsed", () => {
		const res = evaluateStartupGate({
			redisReady: false,
			redisV2Ready: false,
			elapsedMs: 0,
		});
		expect(res.ready).toBe(false);
	});

	test("ready as soon as both Redis clients are ready", () => {
		const res = evaluateStartupGate({
			redisReady: true,
			redisV2Ready: true,
			elapsedMs: 0,
		});
		expect(res.ready).toBe(true);
		expect(res.reason).toContain("Redis ready");
	});

	test("not ready when only one client is ready", () => {
		const res = evaluateStartupGate({
			redisReady: true,
			redisV2Ready: false,
			elapsedMs: 5,
		});
		expect(res.ready).toBe(false);
	});

	test("latches once max-wait elapses even though Redis never becomes ready", () => {
		const res = evaluateStartupGate({
			redisReady: false,
			redisV2Ready: false,
			elapsedMs: STARTUP_GATE_MAX_WAIT_MS,
		});
		expect(res.ready).toBe(true);
		expect(res.reason).toContain("max wait");
	});

	test("does not latch on timeout one ms before the threshold", () => {
		const res = evaluateStartupGate({
			redisReady: false,
			redisV2Ready: false,
			elapsedMs: STARTUP_GATE_MAX_WAIT_MS - 1,
		});
		expect(res.ready).toBe(false);
	});

	test("max-wait is bounded well under the 60s ECS health-check grace period", () => {
		expect(STARTUP_GATE_MAX_WAIT_MS).toBeLessThan(60_000);
	});
});
