import { describe, expect, test } from "bun:test";
import { FeatureCombine } from "@autumn/shared";
import { competingPoolState } from "@/internal/billing/v2/pooledBalances/compute/competing/competingPoolState";

const share = (amount: number, unlimited = false) => ({
	poolId: "pool_1",
	amount,
	unlimited,
});

describe("competingPoolState", () => {
	test("max keeps the highest, min the lowest", () => {
		const shares = [share(24), share(48), share(36)];
		expect(competingPoolState({ shares, combine: FeatureCombine.Max })).toEqual(
			{ best: 48, unlimited: false },
		);
		expect(competingPoolState({ shares, combine: FeatureCombine.Min })).toEqual(
			{ best: 24, unlimited: false },
		);
	});

	test("no shares is zero, not a min of nothing", () => {
		expect(
			competingPoolState({ shares: [], combine: FeatureCombine.Min }),
		).toEqual({ best: 0, unlimited: false });
	});

	test("under max an unlimited share wins", () => {
		expect(
			competingPoolState({
				shares: [share(1000), share(0, true)],
				combine: FeatureCombine.Max,
			}),
		).toEqual({ best: 1000, unlimited: true });
	});

	test("under min a limited share beats unlimited, which applies only alone", () => {
		expect(
			competingPoolState({
				shares: [share(24), share(0, true)],
				combine: FeatureCombine.Min,
			}),
		).toEqual({ best: 24, unlimited: false });
		expect(
			competingPoolState({
				shares: [share(0, true)],
				combine: FeatureCombine.Min,
			}),
		).toEqual({ best: 0, unlimited: true });
	});
});
