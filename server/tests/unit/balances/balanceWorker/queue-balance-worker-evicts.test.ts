import { expect, test } from "bun:test";
import type { EvictCommand } from "@autumn/balance-engine";
import { queueBalanceWorkerEvicts } from "@/internal/balances/balanceWorker/queueBalanceWorkerEvicts.js";

const customer = (customerId: string) => ({
	orgId: "org_1",
	env: "sandbox",
	customerId,
});

test("one queued evict per distinct customer, under one request id", async () => {
	const batches: EvictCommand[][] = [];
	await queueBalanceWorkerEvicts({
		customers: [customer("cus_a"), customer("cus_b"), customer("cus_a")],
		client: {
			queue: {
				track: async () => undefined,
				reset: async () => undefined,
				evict: async ({ commands }) => {
					batches.push([...commands]);
				},
			},
		},
	});
	expect(batches).toHaveLength(1);
	expect(batches[0]?.map((command) => command.identity.customerId)).toEqual([
		"cus_a",
		"cus_b",
	]);
	expect(new Set(batches[0]?.map((command) => command.requestId)).size).toBe(1);
	expect(batches[0]?.[0]).toMatchObject({
		type: "evict",
		identity: { orgId: "org_1", env: "sandbox", entityId: null },
	});
});

test("nothing to evict appends nothing, and a failed append is swallowed", async () => {
	let appends = 0;
	await queueBalanceWorkerEvicts({
		customers: [{ orgId: "org_1", env: "sandbox", customerId: "" }],
		client: {
			queue: {
				track: async () => undefined,
				reset: async () => undefined,
				evict: async () => {
					appends++;
				},
			},
		},
	});
	expect(appends).toBe(0);
	await expect(
		queueBalanceWorkerEvicts({
			customers: [customer("cus_a")],
			client: {
				queue: {
					track: async () => undefined,
					reset: async () => undefined,
					evict: async () => {
						throw new Error("broker down");
					},
				},
			},
		}),
	).resolves.toBeUndefined();
});
