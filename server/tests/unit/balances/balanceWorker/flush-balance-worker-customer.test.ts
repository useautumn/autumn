import { expect, test } from "bun:test";
import type { FlushCommand } from "@autumn/balance-engine";
import { flushBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer.js";
import { contexts } from "../../../utils/fixtures/db/contexts.js";

test("a flush names the customer under the request's id, and a failure never reaches the caller", async () => {
	const ctx = contexts.create({ features: [] });
	const sent: FlushCommand[] = [];
	const signals: (AbortSignal | undefined)[] = [];
	await flushBalanceWorkerCustomer({
		ctx,
		customerId: "cus_1",
		client: {
			flush: async ({ command, signal }) => {
				sent.push(command);
				signals.push(signal);
				return { stored: true };
			},
		},
	});
	expect(sent).toHaveLength(1);
	expect(signals[0]).toBeInstanceOf(AbortSignal);
	expect(sent[0]).toMatchObject({
		type: "flush",
		requestId: ctx.id,
		identity: { customerId: "cus_1", entityId: null },
	});

	await expect(
		flushBalanceWorkerCustomer({
			ctx,
			customerId: "cus_1",
			client: {
				flush: async () => {
					throw new Error("owner unreachable");
				},
			},
		}),
	).resolves.toBeUndefined();
});

test("a flush that outlives its budget is abandoned, not waited on", async () => {
	const ctx = contexts.create({ features: [] });
	const startedAt = Date.now();
	await flushBalanceWorkerCustomer({
		ctx,
		customerId: "cus_1",
		client: {
			flush: ({ signal }) =>
				new Promise((_, reject) => {
					signal?.addEventListener("abort", () => reject(signal.reason), {
						once: true,
					});
				}),
		},
	});
	expect(Date.now() - startedAt).toBeLessThan(1_000);
});
