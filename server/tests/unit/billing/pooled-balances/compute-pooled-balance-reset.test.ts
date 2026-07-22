import { expect, test } from "bun:test";
import { computePooledBalanceReset } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceReset";

const resetAt = 1_803_000_000_000;

test.concurrent(
	"reset restores the sum of next-cycle contributions and rolls sources forward",
	() => {
		expect(
			computePooledBalanceReset({
				resetAt,
				lastAppliedResetAt: null,
				contributions: [
					{
						id: "contribution_a",
						currentCycleContribution: 500,
						nextCycleContribution: 500,
					},
					{
						id: "contribution_b",
						currentCycleContribution: 300,
						nextCycleContribution: 300,
					},
					{
						id: "contribution_scheduled_to_end",
						currentCycleContribution: 200,
						nextCycleContribution: 0,
					},
				],
			}),
		).toEqual({
			resetBalance: 800,
			resetAdjustment: 800,
			lastAppliedResetAt: resetAt,
			contributions: [
				{
					id: "contribution_a",
					currentCycleContribution: 500,
					nextCycleContribution: 500,
				},
				{
					id: "contribution_b",
					currentCycleContribution: 300,
					nextCycleContribution: 300,
				},
				{
					id: "contribution_scheduled_to_end",
					currentCycleContribution: 0,
					nextCycleContribution: 0,
				},
			],
		});
	},
);

test.concurrent("the same or an older reset boundary is idempotent", () => {
	const contributions = [
		{
			id: "contribution_a",
			currentCycleContribution: 500,
			nextCycleContribution: 500,
		},
	];

	expect(
		computePooledBalanceReset({
			resetAt,
			lastAppliedResetAt: resetAt,
			contributions,
		}),
	).toBeNull();
	expect(
		computePooledBalanceReset({
			resetAt: resetAt - 1,
			lastAppliedResetAt: resetAt,
			contributions,
		}),
	).toBeNull();
});

test.concurrent("reset sums decimal contributions without float drift", () => {
	expect(
		computePooledBalanceReset({
			resetAt,
			lastAppliedResetAt: null,
			contributions: [
				{
					id: "contribution_a",
					currentCycleContribution: 0.1,
					nextCycleContribution: 0.1,
				},
				{
					id: "contribution_b",
					currentCycleContribution: 0.2,
					nextCycleContribution: 0.2,
				},
			],
		})?.resetBalance,
	).toBe(0.3);
});

test.concurrent(
	"resetting an empty pool produces an explicit zero grant",
	() => {
		expect(
			computePooledBalanceReset({
				resetAt,
				lastAppliedResetAt: null,
				contributions: [],
			}),
		).toEqual({
			resetBalance: 0,
			resetAdjustment: 0,
			lastAppliedResetAt: resetAt,
			contributions: [],
		});
	},
);

test.concurrent(
	"a future scheduled contribution change is preserved until its effective boundary",
	() => {
		const effectiveAt = resetAt + 10_000;
		const earlyReset = computePooledBalanceReset({
			resetAt,
			lastAppliedResetAt: null,
			contributions: [
				{
					id: "scheduled_contribution",
					currentCycleContribution: 500,
					nextCycleContribution: 0,
					effectiveAt,
				},
			],
		});

		expect(earlyReset).toEqual({
			resetBalance: 500,
			resetAdjustment: 500,
			lastAppliedResetAt: resetAt,
			contributions: [
				{
					id: "scheduled_contribution",
					currentCycleContribution: 500,
					nextCycleContribution: 0,
					effectiveAt,
				},
			],
		});

		expect(
			computePooledBalanceReset({
				resetAt: effectiveAt,
				lastAppliedResetAt: resetAt,
				contributions: earlyReset?.contributions ?? [],
			}),
		).toEqual({
			resetBalance: 0,
			resetAdjustment: 0,
			lastAppliedResetAt: effectiveAt,
			contributions: [
				{
					id: "scheduled_contribution",
					currentCycleContribution: 0,
					nextCycleContribution: 0,
					effectiveAt: null,
				},
			],
		});
	},
);

test.concurrent(
	"a late reset applies a contribution change that became effective after the stale reset timestamp",
	() => {
		const effectiveAt = resetAt + 5_000;
		expect(
			computePooledBalanceReset({
				resetAt,
				asOf: effectiveAt + 1,
				lastAppliedResetAt: null,
				contributions: [
					{
						id: "late_scheduled_contribution",
						currentCycleContribution: 500,
						nextCycleContribution: 0,
						effectiveAt,
					},
				],
			}),
		).toEqual({
			resetBalance: 0,
			resetAdjustment: 0,
			lastAppliedResetAt: resetAt,
			contributions: [
				{
					id: "late_scheduled_contribution",
					currentCycleContribution: 0,
					nextCycleContribution: 0,
					effectiveAt: null,
				},
			],
		});
	},
);

test.concurrent("reset rejects invalid next-cycle contributions", () => {
	for (const invalidContribution of [
		-1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
	]) {
		expect(() =>
			computePooledBalanceReset({
				resetAt,
				lastAppliedResetAt: null,
				contributions: [
					{
						id: "invalid_contribution",
						currentCycleContribution: 0,
						nextCycleContribution: invalidContribution,
					},
				],
			}),
		).toThrow("nextCycleContribution must be finite and non-negative");
	}
});

test.concurrent("reset rejects a contribution sum that overflows", () => {
	expect(() =>
		computePooledBalanceReset({
			resetAt,
			lastAppliedResetAt: null,
			contributions: [
				{
					id: "large_contribution_a",
					currentCycleContribution: 1e308,
					nextCycleContribution: 1e308,
				},
				{
					id: "large_contribution_b",
					currentCycleContribution: 1e308,
					nextCycleContribution: 1e308,
				},
			],
		}),
	).toThrow("resetBalance must be finite and non-negative");
});
