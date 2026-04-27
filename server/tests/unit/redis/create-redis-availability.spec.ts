import { describe, expect, test } from "bun:test";
import { createRedisAvailability } from "@/external/redis/initUtils/createRedisAvailability.js";

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

const wait = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

const waitUntil = async (check: () => boolean, timeoutMs: number) => {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		if (check()) return;
		await wait(50);
	}

	throw new Error(`Condition not met within ${timeoutMs}ms`);
};

describe("createRedisAvailability", () => {
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

	test(
		"reconnects after repeated probe failures while the client still reports ready",
		async () => {
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
		},
		30_000,
	);
});
