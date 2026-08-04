import { describe, expect, test } from "bun:test";
import type { Redis } from "ioredis";
import {
	createRedisClientPair,
	createRedisClientPairRouter,
} from "@/external/redis/initUtils/redisClientPair.js";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";

// A Redis client pair must reroute before dispatch and retry only operations explicitly marked idempotent.

type FakeRedis = {
	status: string;
	calls: string[];
	get: (key: string) => Promise<string | null>;
	set: (key: string, value: string) => Promise<"OK">;
	duplicate: () => Redis;
	disconnect: () => void;
};

const asRedis = (value: FakeRedis): Redis => value as unknown as Redis;

const createFakeRedis = ({
	name,
	status = "ready",
	getError,
	setError,
	duplicateResult,
}: {
	name: string;
	status?: string;
	getError?: Error;
	setError?: Error;
	duplicateResult?: Redis;
}): FakeRedis => ({
	status,
	calls: [],
	async get(key) {
		this.calls.push(`get:${key}`);
		if (getError) throw getError;
		return `${name}:${key}`;
	},
	async set(key, value) {
		this.calls.push(`set:${key}:${value}`);
		if (setError) throw setError;
		return "OK";
	},
	duplicate() {
		this.calls.push("duplicate");
		return duplicateResult ?? asRedis(this);
	},
	disconnect() {
		this.calls.push("disconnect");
	},
});

describe("Redis connection redundancy", () => {
	test("creates two independent application clients", () => {
		const primary = createFakeRedis({ name: "primary" });
		const standby = createFakeRedis({ name: "standby" });
		const createdRoles: string[] = [];

		const router = createRedisClientPair({
			createClient: ({ role }) => {
				createdRoles.push(role);
				return asRedis(role === "primary" ? primary : standby);
			},
		});

		expect(createdRoles).toEqual(["primary", "standby"]);
		expect(router).not.toBe(asRedis(primary));
		expect(router).not.toBe(asRedis(standby));
	});

	test("routes a command to the standby when the primary is not ready", async () => {
		const primary = createFakeRedis({
			name: "primary",
			status: "reconnecting",
		});
		const standby = createFakeRedis({ name: "standby" });
		const router = createRedisClientPairRouter({
			primary: asRedis(primary),
			standby: asRedis(standby),
		});

		expect(router.status).toBe("ready");
		expect(await router.get("subject")).toBe("standby:subject");
		expect(primary.calls).toEqual([]);
		expect(standby.calls).toEqual(["get:subject"]);
	});

	test("keeps the health probe separate from the pair router", () => {
		const probe = createFakeRedis({ name: "probe" });
		const primary = createFakeRedis({
			name: "primary",
			duplicateResult: asRedis(probe),
		});
		const standby = createFakeRedis({ name: "standby" });
		const router = createRedisClientPairRouter({
			primary: asRedis(primary),
			standby: asRedis(standby),
		});

		expect(router.duplicate()).toBe(asRedis(probe));
		expect(router.duplicate()).not.toBe(router);
		expect(primary.calls).toEqual(["duplicate", "duplicate"]);
		expect(standby.calls).toEqual([]);
	});

	test("disconnects both application clients", () => {
		const primary = createFakeRedis({ name: "primary" });
		const standby = createFakeRedis({ name: "standby" });
		const router = createRedisClientPairRouter({
			primary: asRedis(primary),
			standby: asRedis(standby),
		});

		router.disconnect();

		expect(primary.calls).toEqual(["disconnect"]);
		expect(standby.calls).toEqual(["disconnect"]);
	});

	test("retries an idempotent operation once on the other ready client", async () => {
		const primary = createFakeRedis({
			name: "primary",
			getError: new Error("Connection is closed"),
		});
		const standby = createFakeRedis({ name: "standby" });
		const router = createRedisClientPairRouter({
			primary: asRedis(primary),
			standby: asRedis(standby),
		});

		const result = await runRedisOp({
			redisInstance: router,
			source: "test:idempotent-read",
			idempotent: true,
			operation: (activeRedis) => activeRedis.get("subject"),
		});

		expect(result).toBe("standby:subject");
		expect(primary.calls).toEqual(["get:subject"]);
		expect(standby.calls).toEqual(["get:subject"]);
	});

	test("does not retry a non-idempotent operation after dispatch", async () => {
		const primary = createFakeRedis({
			name: "primary",
			setError: new Error("Connection is closed"),
		});
		const standby = createFakeRedis({ name: "standby" });
		const router = createRedisClientPairRouter({
			primary: asRedis(primary),
			standby: asRedis(standby),
		});

		const operation = runRedisOp({
			redisInstance: router,
			source: "test:non-idempotent-write",
			operation: (activeRedis) => activeRedis.set("balance", "1"),
		});

		await expect(operation).rejects.toBeInstanceOf(RedisUnavailableError);
		expect(primary.calls).toEqual(["set:balance:1"]);
		expect(standby.calls).toEqual([]);
	});

	test("preserves not-ready failure when neither client is ready", async () => {
		const primary = createFakeRedis({
			name: "primary",
			status: "reconnecting",
		});
		const standby = createFakeRedis({ name: "standby", status: "connecting" });
		const router = createRedisClientPairRouter({
			primary: asRedis(primary),
			standby: asRedis(standby),
		});

		const operation = runRedisOp({
			redisInstance: router,
			source: "test:both-not-ready",
			operation: (activeRedis) => activeRedis.get("subject"),
		});

		await expect(operation).rejects.toMatchObject({
			name: "RedisUnavailableError",
			reason: "not_ready",
		});
		expect(primary.calls).toEqual([]);
		expect(standby.calls).toEqual([]);
	});
});
