/**
 * Regression coverage for a pooled source whose temporary checkout owner is
 * replaced by the Stripe subscription created at checkout completion.
 *
 * Red: updating an existing contribution changes only its grant amounts, so it
 * remains owned by the temporary customer-product id and invoice reset misses it.
 * Green: the same update persists the authoritative reset owner atomically with
 * the grant amounts.
 */

import { expect, test } from "bun:test";
import { PooledBalanceResetOwnerType } from "@autumn/shared";
import { pooledBalanceRepo } from "@/internal/billing/v2/pooledBalances/repos/pooledBalanceRepo.js";

test("existing pooled contributions migrate from the checkout placeholder to the subscription owner", async () => {
	const updates: Array<Record<string, unknown>> = [];
	const db = {
		update: () => ({
			set: (values: Record<string, unknown>) => {
				updates.push(values);
				return { where: async () => undefined };
			},
		}),
	};

	await pooledBalanceRepo.updateContribution({
		db,
		contributionId: "pooled_contribution_checkout",
		currentContribution: 500,
		nextCycleContribution: 500,
		resetOwnerType: PooledBalanceResetOwnerType.Subscription,
		resetOwnerId: "sub_checkout_completed",
		updatedAt: 1_720_000_000_000,
	} as never);

	expect(updates).toEqual([
		expect.objectContaining({
			reset_owner_type: PooledBalanceResetOwnerType.Subscription,
			reset_owner_id: "sub_checkout_completed",
		}),
	]);
});
