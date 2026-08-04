/**
 * Regression coverage for Redis monitor connection ownership.
 *
 * Before, the monitor eagerly opened its probe, warmed connections serially,
 * and could disconnect the request client. The monitor now creates an isolated
 * probe only when started, warms both clients concurrently, and leaves request
 * reconnects to ioredis.
 */
import { describe, expect, test } from "bun:test";
import net from "node:net";
import { Redis } from "ioredis";
import {
	classifyProbe,
	createRedisAvailability,
	histogramMaxToMs,
} from "@/external/redis/initUtils/createRedisAvailability.js";

class FakeRedis {
	status = "ready";
	connectCalls = 0;
	disconnectCalls: Array<boolean | undefined> = [];
	duplicateCalls = 0;
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

	duplicate(): FakeRedis {
		this.duplicateCalls++;
		return this;
	}

	on() {
		return this;
	}
}

class HealthyFakeRedis extends FakeRedis {
	override async ping() {
		this.pingCalls++;
		return "PONG";
	}
}

class BusyRequestRedis extends FakeRedis {
	readonly probeRedis = new HealthyFakeRedis();

	override async ping() {
		this.pingCalls++;
		return "NOPE";
	}

	override duplicate() {
		this.duplicateCalls++;
		return this.probeRedis;
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

class DualConnectingRedis extends ConnectingFakeRedis {
	readonly probeRedis = new ConnectingFakeRedis();

	override duplicate() {
		this.duplicateCalls++;
		return this.probeRedis;
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

const startPingRedisServer = async ({ port = 0 }: { port?: number } = {}) => {
	const sockets = new Set<net.Socket>();
	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
		socket.on("data", () => socket.write("+PONG\r\n"));
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});

	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Failed to bind Redis test server");
	}

	return {
		port: address.port,
		stop: async () => {
			for (const socket of sockets) socket.destroy();
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
			});
		},
	};
};

describe("createRedisAvailability", () => {
	test("does not start monitoring when Redis is not configured", () => {
		const originalSetInterval = globalThis.setInterval;
		let intervalCalls = 0;
		globalThis.setInterval = ((_handler: TimerHandler) => {
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

	test("creates the probe connection only when monitoring begins", async () => {
		const redis = new BusyRequestRedis();
		const availability = createRedisAvailability({
			redis: redis as never,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
		});

		expect(redis.duplicateCalls).toBe(0);

		await availability.prime();

		expect(redis.duplicateCalls).toBe(1);
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

	test("waits for the request and probe connections concurrently", async () => {
		const redis = new DualConnectingRedis();
		const availability = createRedisAvailability({
			redis: redis as never,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
		});

		const primePromise = availability.prime();
		await wait(0);
		const requestWaitRegistered = redis.readyHandler !== undefined;
		const probeWaitRegistered = redis.probeRedis.readyHandler !== undefined;

		redis.status = "ready";
		redis.probeRedis.status = "ready";
		redis.readyHandler?.();
		redis.probeRedis.readyHandler?.();
		await primePromise;

		expect(requestWaitRegistered).toBe(true);
		expect(probeWaitRegistered).toBe(true);
		expect(availability.shouldUseRedis()).toBe(true);
	});

	test("isolates availability probes from the request connection", async () => {
		const redis = new BusyRequestRedis();
		const availability = createRedisAvailability({
			redis: redis as never,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
		});

		await availability.prime();
		for (let index = 0; index < 10; index++) {
			await availability._runTickForTesting();
		}

		expect(availability.shouldUseRedis()).toBe(true);
		expect(redis.pingCalls).toBe(0);
		expect(redis.probeRedis.pingCalls).toBeGreaterThan(0);
		expect(redis.disconnectCalls).toEqual([]);
		expect(redis.connectCalls).toBe(0);
	});

	test("preserves ioredis reconnect ownership after the endpoint closes", async () => {
		let endpoint = await startPingRedisServer();
		const port = endpoint.port;
		const redis = new Redis({
			host: "127.0.0.1",
			port,
			connectTimeout: 250,
			commandTimeout: 250,
			disableClientInfo: true,
			enableReadyCheck: false,
			retryStrategy: () => 250,
		});
		redis.on("error", () => {});

		const disconnectCalls: Array<boolean | undefined> = [];
		const disconnect = redis.disconnect.bind(redis);
		redis.disconnect = ((reconnect?: boolean) => {
			disconnectCalls.push(reconnect);
			disconnect(reconnect);
		}) as Redis["disconnect"];

		const availability = createRedisAvailability({
			redis,
			hasConfig: true,
			logPrefix: "RedisV2",
			logType: "redis_v2_availability_state_set",
			getEventLoopLagMs: () => 0,
		});

		try {
			await waitUntil(() => redis.status === "ready", 2_000);
			await availability.prime();
			expect(availability.shouldUseRedis()).toBe(true);

			await endpoint.stop();
			await waitUntil(() => redis.status === "reconnecting", 2_000);
			await availability._runTickForTesting();

			await wait(5_100);
			await availability._runTickForTesting();

			endpoint = await startPingRedisServer({ port });
			await waitUntil(() => redis.status === "ready", 2_000);

			expect(disconnectCalls).not.toContain(false);
			expect(await redis.ping()).toBe("PONG");
		} finally {
			availability.stopMonitor();
			redis.disconnect();
			await endpoint.stop().catch(() => {});
		}
	}, 15_000);
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
