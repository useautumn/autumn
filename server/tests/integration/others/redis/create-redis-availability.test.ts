import { describe, expect, test } from "bun:test";
import {
	classifyProbe,
	createRedisAvailability,
	histogramMaxToMs,
} from "@/external/redis/initUtils/createRedisAvailability.js";

class FakeRedis {
	status = "ready";
	connectCalls = 0;
	disconnectCalls: Array<boolean | undefined> = [];
	pingCalls = 0;

	async ping() {
		this.pingCalls++;
		if (this.pingCalls <= 9) {
			return await new Promise<string>(() => {});
		}

		return "PONG";
	}

	disconnect(reconnect?: boolean) {
		this.disconnectCalls.push(reconnect);
		this.status = "end";
	}

	async connect() {
		this.connectCalls++;
		this.status = "ready";
	}
}

class HealthyFakeRedis extends FakeRedis {
	override async ping() {
		this.pingCalls++;
		return "PONG";
	}
}

class ConnectingFakeRedis extends HealthyFakeRedis {
	status = "connecting";
	readyHandler?: () => void;
	errorHandler?: (error: Error) => void;

	once(event: string, handler: (...args: never[]) => void) {
		if (event === "ready") this.readyHandler = handler as () => void;
		if (event === "error")
			this.errorHandler = handler as (error: Error) => void;
		return this;
	}
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitUntil = async (check: () => boolean, timeoutMs: number) => {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		if (check()) return;
		await wait(50);
	}

	throw new Error(`Condition not met within ${timeoutMs}ms`);
};

describe("createRedisAvailability", () => {
	test("does not start monitoring when Redis is not configured", () => {
		const originalSetInterval = globalThis.setInterval;
		let intervalCalls = 0;
		globalThis.setInterval = ((handler: TimerHandler) => {
			intervalCalls++;
			return 0 as unknown as ReturnType<typeof setInterval>;
		}) as unknown as typeof setInterval;

		try {
			const redis = new FakeRedis();
			const availability = createRedisAvailability({
				redis: redis as never,
				hasConfig: false,
				logPrefix: "RedisV2",
				logType: "redis_v2_availability_state_set",
			});

			availability.startMonitor();

			expect(intervalCalls).toBe(0);
			expect(availability.shouldUseRedis()).toBe(false);
		} finally {
			globalThis.setInterval = originalSetInterval;
		}
	});

	test("starts degraded before the first probe runs", () => {
		const redis = new FakeRedis();
		const availability = createRedisAvailability({
			redis: redis as never,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
		});

		expect(availability.shouldUseRedis()).toBe(false);
	});

	test("primes healthy after a successful initial probe", async () => {
		const redis = new HealthyFakeRedis();
		const availability = createRedisAvailability({
			redis: redis as never,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
		});

		await availability.prime();

		expect(availability.shouldUseRedis()).toBe(true);
	});

	test("waits for a connecting client before priming availability", async () => {
		const redis = new ConnectingFakeRedis();
		const availability = createRedisAvailability({
			redis: redis as never,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
		});

		setTimeout(() => {
			redis.status = "ready";
			redis.readyHandler?.();
		}, 0);

		await availability.prime();

		expect(availability.shouldUseRedis()).toBe(true);
	});

	test("reconnects after repeated probe failures while the client still reports ready", async () => {
		const redis = new FakeRedis();
		const availability = createRedisAvailability({
			redis: redis as never,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
		});

		availability.startMonitor();
		await waitUntil(() => redis.connectCalls > 0, 22_000);
		availability.stopMonitor();

		expect(redis.disconnectCalls).toContain(false);
	}, 30_000);
});

class FlippableFakeRedis extends FakeRedis {
	pingOk = true;

	override async ping() {
		this.pingCalls++;
		return this.pingOk ? "PONG" : "NOPE";
	}
}

describe("classifyProbe", () => {
	const thresholdMs = 500;

	test("a successful ping is available regardless of loop lag", () => {
		expect(
			classifyProbe({ outcome: "available", eventLoopLagMs: 0, thresholdMs }),
		).toBe("available");
		expect(
			classifyProbe({
				outcome: "available",
				eventLoopLagMs: 9_999,
				thresholdMs,
			}),
		).toBe("available");
	});

	test("a dropped connection is unavailable regardless of loop lag", () => {
		expect(
			classifyProbe({
				outcome: "connection_down",
				eventLoopLagMs: 0,
				thresholdMs,
			}),
		).toBe("unavailable");
		expect(
			classifyProbe({
				outcome: "connection_down",
				eventLoopLagMs: 9_999,
				thresholdMs,
			}),
		).toBe("unavailable");
	});

	test("ping timeout while ready with a healthy loop is unavailable (redis genuinely hung)", () => {
		expect(
			classifyProbe({
				outcome: "unresponsive_while_ready",
				eventLoopLagMs: 0,
				thresholdMs,
			}),
		).toBe("unavailable");
		expect(
			classifyProbe({
				outcome: "unresponsive_while_ready",
				eventLoopLagMs: 499,
				thresholdMs,
			}),
		).toBe("unavailable");
	});

	test("ping timeout while ready with a jammed loop is inconclusive (false-degrade fix)", () => {
		expect(
			classifyProbe({
				outcome: "unresponsive_while_ready",
				eventLoopLagMs: 501,
				thresholdMs,
			}),
		).toBe("inconclusive");
		expect(
			classifyProbe({
				outcome: "unresponsive_while_ready",
				eventLoopLagMs: 5_000,
				thresholdMs,
			}),
		).toBe("inconclusive");
	});

	test("lag exactly at the threshold is unavailable (strict greater-than boundary)", () => {
		expect(
			classifyProbe({
				outcome: "unresponsive_while_ready",
				eventLoopLagMs: 500,
				thresholdMs,
			}),
		).toBe("unavailable");
	});
});

describe("createRedisAvailability loop-lag awareness", () => {
	test("sustained event-loop lag does NOT degrade a healthy monitor", async () => {
		const redis = new FlippableFakeRedis();
		const availability = createRedisAvailability({
			redis: redis as never,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
			getEventLoopLagMs: () => 5_000,
		});

		await availability.prime();
		expect(availability.shouldUseRedis()).toBe(true);

		redis.pingOk = false;
		for (let i = 0; i < 10; i++) {
			await availability._runTickForTesting();
		}

		expect(availability.shouldUseRedis()).toBe(true);
	});

	test("sustained ping failure with a healthy loop still degrades (real-failure detection preserved)", async () => {
		const redis = new FlippableFakeRedis();
		const availability = createRedisAvailability({
			redis: redis as never,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
			getEventLoopLagMs: () => 0,
		});

		await availability.prime();
		expect(availability.shouldUseRedis()).toBe(true);

		redis.pingOk = false;
		for (let i = 0; i < 10; i++) {
			await availability._runTickForTesting();
		}

		expect(availability.shouldUseRedis()).toBe(false);
	});

	test("degrades once consecutive inconclusive probes exceed the cap (bounded suppression)", async () => {
		const redis = new FlippableFakeRedis();
		const availability = createRedisAvailability({
			redis: redis as never,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
			getEventLoopLagMs: () => 5_000,
			maxConsecutiveInconclusive: 3,
		});

		await availability.prime();
		expect(availability.shouldUseRedis()).toBe(true);

		redis.pingOk = false;
		for (let i = 0; i < 12; i++) {
			await availability._runTickForTesting();
		}

		expect(availability.shouldUseRedis()).toBe(false);
	});

	test("a successful ping resets the inconclusive budget so transient lag never trips the cap", async () => {
		const redis = new FlippableFakeRedis();
		const availability = createRedisAvailability({
			redis: redis as never,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
			getEventLoopLagMs: () => 5_000,
			maxConsecutiveInconclusive: 3,
		});

		await availability.prime();

		for (let i = 0; i < 30; i++) {
			redis.pingOk = i % 3 === 2;
			await availability._runTickForTesting();
		}

		expect(availability.shouldUseRedis()).toBe(true);
	});
});

class DownFakeRedis extends FakeRedis {
	override status = "end";

	override async ping(): Promise<string> {
		this.pingCalls++;
		throw new Error("connection closed");
	}

	override async connect() {
		this.connectCalls++;
		this.status = "end";
		throw new Error("redis down");
	}
}

describe("createRedisAvailability prime() loop-lag awareness", () => {
	test("does NOT degrade when the initial boot probe times out under event-loop lag", async () => {
		const redis = new FlippableFakeRedis();
		redis.pingOk = false;
		const availability = createRedisAvailability({
			redis: redis as never,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
			getEventLoopLagMs: () => 5_000,
		});

		await availability.prime();

		expect(availability.shouldUseRedis()).toBe(true);
	});

	test("still degrades at boot on a genuine connection failure regardless of lag", async () => {
		const redis = new DownFakeRedis();
		const availability = createRedisAvailability({
			redis: redis as never,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
			getEventLoopLagMs: () => 5_000,
		});

		await availability.prime();

		expect(availability.shouldUseRedis()).toBe(false);
	});
});

describe("createRedisAvailability recovery-streak integrity", () => {
	test("an inconclusive probe breaks the recovery streak so a flapping redis cannot return to healthy", async () => {
		let lag = 0;
		const redis = new FlippableFakeRedis();
		const availability = createRedisAvailability({
			redis: redis as never,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
			getEventLoopLagMs: () => lag,
		});

		redis.pingOk = false;
		await availability.prime();
		expect(availability.shouldUseRedis()).toBe(false);

		lag = 5_000;
		for (let i = 0; i < 12; i++) {
			redis.pingOk = i % 3 !== 2;
			await availability._runTickForTesting();
		}

		expect(availability.shouldUseRedis()).toBe(false);
	});
});

describe("createRedisAvailability real event-loop sampler", () => {
	test("uses the real sampler when no override is injected and stays healthy on a quiet loop", async () => {
		const redis = new HealthyFakeRedis();
		const availability = createRedisAvailability({
			redis: redis as never,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
		});

		await availability.prime();
		expect(availability.shouldUseRedis()).toBe(true);

		await availability._runTickForTesting();
		expect(availability.shouldUseRedis()).toBe(true);
	});
});

describe("histogramMaxToMs", () => {
	test("converts event-loop delay nanoseconds to milliseconds", () => {
		expect(histogramMaxToMs(500_000_000)).toBe(500);
		expect(histogramMaxToMs(1_000_000)).toBe(1);
		expect(histogramMaxToMs(0)).toBe(0);
	});
});

describe("createRedisAvailability real probe-timeout path", () => {
	test("a real ping timeout under event-loop lag is inconclusive and does not degrade", async () => {
		const redis = new FakeRedis();
		const availability = createRedisAvailability({
			redis: redis as never,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
			getEventLoopLagMs: () => 5_000,
		});

		await availability.prime();
		expect(availability.shouldUseRedis()).toBe(true);

		await availability._runTickForTesting();
		await availability._runTickForTesting();

		expect(availability.shouldUseRedis()).toBe(true);
		expect(redis.connectCalls).toBe(0);
	}, 20_000);
});
