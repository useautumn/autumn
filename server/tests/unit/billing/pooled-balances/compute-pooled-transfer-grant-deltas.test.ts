import { expect, test } from "bun:test";
import { computePooledTransferGrantDeltas } from "@/internal/billing/v2/pooledBalances/compute/computePooledTransferGrantDeltas.js";

test("moves one contribution while leaving the coalesced old pool funded", () => {
	const oldPoolGrant = 1_000;
	const destinationPoolGrant = 0;
	const deltas = computePooledTransferGrantDeltas({
		previousPooledBalanceId: "old_pool",
		destinationPooledBalanceId: "new_pool",
		previousContribution: 500,
		desiredContribution: 500,
	});
	const deltaByPoolId = new Map(
		deltas.map((delta) => [delta.pooledBalanceId, delta]),
	);

	expect(
		oldPoolGrant + (deltaByPoolId.get("old_pool")?.adjustmentDelta ?? 0),
	).toBe(500);
	expect(
		destinationPoolGrant +
			(deltaByPoolId.get("new_pool")?.adjustmentDelta ?? 0),
	).toBe(500);
});

test("updates only the net grant when provenance stays in the same pool", () => {
	expect(
		computePooledTransferGrantDeltas({
			previousPooledBalanceId: "same_pool",
			destinationPooledBalanceId: "same_pool",
			previousContribution: 500,
			desiredContribution: 650,
		}),
	).toEqual([
		{
			pooledBalanceId: "same_pool",
			balanceDelta: 150,
			adjustmentDelta: 150,
		},
	]);
});
