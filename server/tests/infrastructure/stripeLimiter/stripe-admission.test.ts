import { afterAll, expect, test } from "bun:test";
import { Redis } from "ioredis";
import admissionScript from "../../../src/external/connect/clientCache/twStripeLimiter/stripeAdmission.lua" with {
	type: "text",
};
import type { TwStripeLane } from "../../../src/external/connect/clientCache/twStripeLimiter/types/twStripeAdmission";

const redis = new Redis(
	process.env.TW_STRIPE_REDIS_URL ?? "redis://127.0.0.1:6379",
	{ maxRetriesPerRequest: 0 },
);
const ownedKeys: string[] = [];
afterAll(async () => {
	if (ownedKeys.length) await redis.del(...ownedKeys);
	redis.disconnect();
});

const createAdmission = ({ maximum = 8 }: { maximum?: number } = {}) => {
	const prefix = `tw:stripe:test:${crypto.randomUUID()}`;
	const keys = [
		"state",
		"bulk",
		"webhook",
		"waiting",
		"active",
		"activeBulk",
	].map((suffix) => `${prefix}:${suffix}`);
	ownedKeys.push(...keys);
	const attempt = async ({
		id,
		lane = "bulk",
		interval = 50,
		lease = 85000,
		operation = "acquire",
	}: {
		id: string;
		lane?: TwStripeLane;
		interval?: number;
		lease?: number;
		operation?: string;
	}) =>
		(await redis.eval(
			admissionScript,
			keys.length,
			...keys,
			operation,
			id,
			lane,
			interval,
			maximum,
			lease,
		)) as [number, number];
	const ready = async () => {
		await redis.hset(keys[0], "nextAt", 0);
	};
	const pause = async () => {
		await redis.hset(keys[0], "nextAt", Date.now() + 60000);
	};
	return { keys, attempt, ready, pause };
};

test("webhooks get three turns then bulk gets a turn; each lane remains FIFO", async () => {
	const gate = createAdmission();
	await gate.pause();
	for (const id of ["bulk-1", "bulk-2"]) await gate.attempt({ id });
	for (const id of ["webhook-1", "webhook-2", "webhook-3", "webhook-4"])
		await gate.attempt({ id, lane: "webhook" });
	for (const id of [
		"webhook-1",
		"webhook-2",
		"webhook-3",
		"bulk-1",
		"webhook-4",
		"bulk-2",
	]) {
		await gate.ready();
		const lane = id.startsWith("webhook") ? "webhook" : "bulk";
		const other = lane === "webhook" ? "bulk-2" : "webhook-4";
		if (id !== "bulk-2")
			expect(
				(
					await gate.attempt({
						id: other,
						lane: lane === "webhook" ? "bulk" : "webhook",
					})
				)[0],
			).toBe(0);
		expect((await gate.attempt({ id, lane }))[0]).toBe(1);
		await gate.attempt({ id, lane, operation: "release" });
	}
});

test("bulk cannot occupy the final in-flight slot needed by a webhook", async () => {
	const gate = createAdmission({ maximum: 2 });
	expect((await gate.attempt({ id: "bulk-1" }))[0]).toBe(1);
	await gate.ready();
	expect((await gate.attempt({ id: "bulk-2" }))[0]).toBe(0);
	expect((await gate.attempt({ id: "webhook", lane: "webhook" }))[0]).toBe(1);
	expect(await redis.zcard(gate.keys[4])).toBe(2);
	await gate.attempt({ id: "bulk-1", operation: "release" });
	await gate.ready();
	expect((await gate.attempt({ id: "bulk-2" }))[0]).toBe(1);
	await gate.attempt({ id: "bulk-2", operation: "release" });
	await gate.attempt({ id: "webhook", lane: "webhook", operation: "release" });
	expect(await redis.zcard(gate.keys[4])).toBe(0);
});

test("expired callers cannot strand queue entries or in-flight permits", async () => {
	const gate = createAdmission({ maximum: 2 });
	await gate.attempt({ id: "dead-active" });
	await gate.ready();
	await gate.attempt({ id: "dead-waiter" });
	await redis.zadd(gate.keys[3], 0, "dead-waiter");
	await redis.zadd(gate.keys[4], 0, "dead-active");
	await redis.zadd(gate.keys[5], 0, "dead-active");
	expect((await gate.attempt({ id: "healthy" }))[0]).toBe(1);
	expect(await redis.zscore(gate.keys[1], "dead-waiter")).toBeNull();
	expect(await redis.zcard(gate.keys[4])).toBe(1);
});

test("a shorter request cannot shorten the lifetime of an existing permit", async () => {
	const gate = createAdmission();
	await gate.attempt({ id: "long", lease: 120000 });
	expect(await redis.pttl(gate.keys[4])).toBeGreaterThan(120000);
	await gate.ready();
	await gate.attempt({ id: "short", lease: 1000 });
	expect(await redis.pttl(gate.keys[4])).toBeGreaterThan(120000);
});

test("processes with different budget settings fail rather than mint extra capacity", async () => {
	const gate = createAdmission();
	await gate.attempt({ id: "first" });
	await expect(
		gate.attempt({ id: "mismatched", interval: 100 }),
	).rejects.toThrow("differs between worker processes");
	expect(await redis.zscore(gate.keys[1], "mismatched")).toBeNull();
});
