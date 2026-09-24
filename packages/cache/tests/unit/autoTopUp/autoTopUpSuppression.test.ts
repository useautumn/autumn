import { beforeEach, describe, expect, test } from "bun:test";
import { createConsoleLogger } from "@autumn/logging";
import type { Redis } from "ioredis";
import {
	AUTO_TOPUP_PENDING_TTL_SECONDS,
	buildAutoTopupPendingKey,
	claimAutoTopupPendingKey,
	claimAutoTopupWebhookSuppression,
	clearAutoTopupPendingKey,
	keepAutoTopupPendingKey,
} from "../../../src/cache.js";

const store = new Map<string, string>();
const calls: string[] = [];
let status = "ready";

const fakeRedis = {
	get status() {
		return status;
	},
	async set(key: string, value: string, ...args: (string | number)[]) {
		calls.push(`set:${key}:${args.join(":")}`);
		if (args.includes("NX") && store.has(key)) return null;
		store.set(key, value);
		return "OK";
	},
	async del(key: string) {
		calls.push(`del:${key}`);
		return store.delete(key) ? 1 : 0;
	},
} as unknown as Redis;

const ctx = {
	miscCache: { getActive: () => fakeRedis },
	logger: createConsoleLogger({ level: "error" }),
};
const key = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	featureId: "credits",
};
const pendingKey = buildAutoTopupPendingKey(key);

beforeEach(() => {
	store.clear();
	calls.length = 0;
	status = "ready";
});

describe("pending key", () => {
	test("first claim wins; a second claim sees it pending", async () => {
		expect(await claimAutoTopupPendingKey({ ctx, ...key })).toBe("claimed");
		expect(calls[0]).toBe(
			`set:${pendingKey}:EX:${AUTO_TOPUP_PENDING_TTL_SECONDS}:NX`,
		);
		expect(await claimAutoTopupPendingKey({ ctx, ...key })).toBe(
			"pending_exists",
		);
	});

	test("clear releases the gate; keep extends it without NX", async () => {
		await claimAutoTopupPendingKey({ ctx, ...key });
		await clearAutoTopupPendingKey({ ctx, ...key });
		expect(store.has(pendingKey)).toBe(false);

		await keepAutoTopupPendingKey({ ctx, ...key, ttlMs: 5_000 });
		expect(calls.at(-1)).toBe(`set:${pendingKey}:PX:5000`);
	});

	test("a client that is not ready reports unavailable", async () => {
		status = "connecting";
		expect(await claimAutoTopupPendingKey({ ctx, ...key })).toBe("unavailable");
	});
});

describe("webhook suppression", () => {
	test("emits once per key, then suppresses; fails open when Redis is down", async () => {
		const params = { ctx, suppressionKey: "wh:1", suppressionTtlMs: 1_500 };
		expect(await claimAutoTopupWebhookSuppression(params)).toBe(true);
		expect(calls[0]).toBe("set:wh:1:EX:2:NX");
		expect(await claimAutoTopupWebhookSuppression(params)).toBe(false);

		status = "connecting";
		expect(await claimAutoTopupWebhookSuppression(params)).toBe(true);
	});
});
