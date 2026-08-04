import { describe, expect, test } from "bun:test";
import type { Redis } from "ioredis";
import {
	createStandbyRedisRouter,
	getStandbyRedisConnections,
} from "@/external/redis/initUtils/createStandbyRedisRouter.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";

type FakeRedis = {
	status: string;
	calls: string[];
	disconnect: () => void;
	quit: () => Promise<"OK">;
	get: (key: string) => Promise<string>;
	set: (key: string, value: string) => Promise<"OK">;
	pipeline: () => {
		get: (key: string) => unknown;
		exec: () => Promise<[Error | null, string][]>;
	};
};

const asRedis = (redis: FakeRedis) => redis as unknown as Redis;

const createFakeRedis = ({
	name,
	status = "ready",
	getError,
	pipelineError,
}: {
	name: string;
	status?: string;
	getError?: Error;
	pipelineError?: Error;
}): FakeRedis => {
	const calls: string[] = [];
	return {
		status,
		calls,
		disconnect() {
			calls.push("disconnect");
		},
		async quit() {
			calls.push("quit");
			return "OK";
		},
		async get(key) {
			calls.push(`get:${key}`);
			if (getError) throw getError;
			return name;
		},
		async set(key, value) {
			calls.push(`set:${key}:${value}`);
			return "OK";
		},
		pipeline() {
			const keys: string[] = [];
			return {
				get(key: string) {
					keys.push(key);
					return this;
				},
				async exec() {
					calls.push(`pipeline:${keys.join(",")}`);
					if (pipelineError) throw pipelineError;
					return keys.map(() => [null, name]);
				},
			};
		},
	};
};

describe("standby Redis routing", () => {
	test("routes operations to the ready standby", async () => {
		const primary = createFakeRedis({
			name: "primary",
			status: "reconnecting",
		});
		const standby = createFakeRedis({ name: "standby" });
		const redis = createStandbyRedisRouter({
			primary: asRedis(primary),
			standby: asRedis(standby),
		});

		expect(redis.status).toBe("ready");
		expect(await redis.get("customer")).toBe("standby");
		expect(await redis.set("customer", "value")).toBe("OK");
		expect(primary.calls).toEqual([]);
		expect(standby.calls).toEqual(["get:customer", "set:customer:value"]);
	});

	test("retries a failed idempotent read on the standby", async () => {
		const primary = createFakeRedis({
			name: "primary",
			getError: new Error("connection closed"),
		});
		const standby = createFakeRedis({ name: "standby" });
		const redis = createStandbyRedisRouter({
			primary: asRedis(primary),
			standby: asRedis(standby),
		});

		expect(await redis.get("customer")).toBe("standby");
		expect(primary.calls).toEqual(["get:customer"]);
		expect(standby.calls).toEqual(["get:customer"]);
	});

	test("does not retry writes whose outcome may be ambiguous", async () => {
		const primary = createFakeRedis({ name: "primary" });
		const standby = createFakeRedis({ name: "standby" });
		primary.set = async (key, value) => {
			primary.calls.push(`set:${key}:${value}`);
			throw new Error("connection closed");
		};
		const redis = createStandbyRedisRouter({
			primary: asRedis(primary),
			standby: asRedis(standby),
		});

		await expect(redis.set("customer", "value")).rejects.toThrow(
			"connection closed",
		);
		expect(primary.calls).toEqual(["set:customer:value"]);
		expect(standby.calls).toEqual([]);
	});

	test("closes both underlying connections during pool teardown", async () => {
		const primary = createFakeRedis({ name: "primary" });
		const standby = createFakeRedis({ name: "standby" });
		const redis = createStandbyRedisRouter({
			primary: asRedis(primary),
			standby: asRedis(standby),
		});

		redis.disconnect();
		expect(primary.calls).toEqual(["disconnect"]);
		expect(standby.calls).toEqual(["disconnect"]);

		await redis.quit();
		expect(primary.calls).toEqual(["disconnect", "quit"]);
		expect(standby.calls).toEqual(["disconnect", "quit"]);
	});

	test("rebuilds and retries an idempotent pipeline on the standby", async () => {
		const primary = createFakeRedis({
			name: "primary",
			pipelineError: new Error("connection closed"),
		});
		const standby = createFakeRedis({ name: "standby" });
		const redis = createStandbyRedisRouter({
			primary: asRedis(primary),
			standby: asRedis(standby),
		});

		const result = await runRedisOp({
			redisInstance: redis,
			source: "standby-test",
			retryOnStandby: true,
			operation: (connection) =>
				connection.pipeline().get("subject").get("epoch").exec(),
		});

		expect(result?.map((entry) => entry[1])).toEqual(["standby", "standby"]);
		expect(primary.calls).toEqual(["pipeline:subject,epoch"]);
		expect(standby.calls).toEqual(["pipeline:subject,epoch"]);
		expect(getStandbyRedisConnections(redis)).toEqual([
			asRedis(primary),
			asRedis(standby),
		]);
	});
});
