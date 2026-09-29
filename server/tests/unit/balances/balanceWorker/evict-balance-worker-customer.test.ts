import { expect, test } from "bun:test";
import type { EvictCommand } from "@autumn/balance-engine";
import { evictBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/evictBalanceWorkerCustomer.js";
import { contexts } from "../../../utils/fixtures/db/contexts.js";

test("a server evict names the customer under the request's id, whatever the rollout says", async () => {
	const ctx = contexts.create({ features: [] });
	const sent: EvictCommand[] = [];
	const previousRollout = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "false";
	try {
		await evictBalanceWorkerCustomer({
			ctx,
			customerId: "cus_1",
			client: {
				evict: async ({ command }) => {
					sent.push(command);
					return { evicted: true };
				},
			},
		});
	} finally {
		if (previousRollout === undefined)
			delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
		else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousRollout;
	}
	expect(sent).toHaveLength(1);
	expect(sent[0]).toMatchObject({
		type: "evict",
		requestId: ctx.id,
		identity: { customerId: "cus_1", entityId: null },
	});
});
