import { beforeEach, describe, expect, test } from "bun:test";
import { buildAutoTopupPendingKey } from "@autumn/cache";
import { createConsoleLogger } from "@autumn/logging";
import { AppEnv } from "@autumn/shared";
import { dispatchAutoTopup } from "../../../src/dispatch/dispatchAutoTopup.js";
import type { AutoTopupJobPayload } from "../../../src/dispatch/types/autoTopupDispatch.js";

const keys = new Set<string>();
let status = "ready";
const fakeRedis = {
	get status() {
		return status;
	},
	async set(key: string) {
		if (keys.has(key)) return null;
		keys.add(key);
		return "OK";
	},
	async del(key: string) {
		return keys.delete(key) ? 1 : 0;
	},
};

const enqueued: AutoTopupJobPayload[] = [];
const ctx = {
	miscCache: { getActive: () => fakeRedis as never },
	logger: createConsoleLogger({ level: "error" }),
	sqsJobs: {
		autoTopup: {
			send: async () => undefined,
			trySend: async (payload: AutoTopupJobPayload) => {
				enqueued.push(payload);
				return { sent: true as const };
			},
		},
	},
};
const payload: AutoTopupJobPayload = {
	orgId: "org_1",
	env: AppEnv.Sandbox,
	customerId: "cus_1",
	featureId: "credits",
};

beforeEach(() => {
	keys.clear();
	enqueued.length = 0;
	status = "ready";
});

describe("dispatchAutoTopup", () => {
	test("claims the pending key, then enqueues the payload once", async () => {
		expect(await dispatchAutoTopup({ ctx, payload })).toEqual({
			enqueued: true,
			reason: "enqueued",
		});
		expect(enqueued).toEqual([payload]);
		expect([...keys]).toEqual([buildAutoTopupPendingKey(payload)]);
	});

	test("a second dispatch inside the window enqueues nothing", async () => {
		await dispatchAutoTopup({ ctx, payload });
		expect(await dispatchAutoTopup({ ctx, payload })).toEqual({
			enqueued: false,
			reason: "pending_key_exists",
		});
		expect(enqueued).toHaveLength(1);
	});

	test("without Redis it enqueues nothing and says so", async () => {
		status = "connecting";
		expect(await dispatchAutoTopup({ ctx, payload })).toEqual({
			enqueued: false,
			reason: "redis_unavailable",
		});
		expect(enqueued).toHaveLength(0);
	});

	test("a failed send releases the claim so the next deduction can retry", async () => {
		const failing = {
			...ctx,
			sqsJobs: {
				autoTopup: {
					send: async () => undefined,
					trySend: async () => ({
						sent: false as const,
						error: new Error("queue down"),
					}),
				},
			},
		};
		expect(await dispatchAutoTopup({ ctx: failing, payload })).toEqual({
			enqueued: false,
			reason: "send_failed",
		});
		expect(keys.size).toBe(0);
	});
});
