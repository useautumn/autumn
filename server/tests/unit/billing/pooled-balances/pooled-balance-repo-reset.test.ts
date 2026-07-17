// Red: reset publishes additional_balance=0 to Redis but leaves a stale DB value behind.
// Green: the optimistic customer-entitlement reset clears additional_balance atomically.
import { expect, test } from "bun:test";
import { pooledBalanceRepo } from "@/internal/billing/v2/pooledBalances/repos/pooledBalanceRepo.js";

test("pooled reset clears the synthetic entitlement additional balance", async () => {
	const updates: Array<Record<string, unknown>> = [];
	const db = {
		update: () => ({
			set: (values: Record<string, unknown>) => {
				updates.push(values);
				return {
					where: () =>
						updates.length === 1
							? { returning: async () => [{ id: "customer_entitlement" }] }
							: Promise.resolve(undefined),
				};
			},
		}),
	};

	const applied = await pooledBalanceRepo.applyReset({
		db,
		pool: {
			id: "pooled_balance",
			customer_entitlement_id: "customer_entitlement",
		},
		expectedNextResetAt: Date.UTC(2027, 0, 1),
		nextResetAt: Date.UTC(2027, 1, 1),
		balance: 500,
		adjustment: 500,
		contributions: [],
		now: Date.UTC(2027, 0, 1),
	} as never);

	expect(applied).toBe(true);
	expect(updates[0]).toMatchObject({
		balance: 500,
		adjustment: 500,
		additional_balance: 0,
	});
});
