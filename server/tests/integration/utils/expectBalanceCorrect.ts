import { expect } from "bun:test";
import {
	type ApiBalanceRollover,
	type ApiCustomerV5,
	type ApiEntityV2,
	BillingMethod,
	formatMs,
	type ResetInterval,
} from "@autumn/shared";

const roundTo8Dp = (value: number) =>
	Math.round(value * 1e8) / 1e8;

type BucketExpectation = {
	included_grant?: number;
	prepaid_grant?: number;
	remaining?: number;
	usage?: number;
};

type BreakdownKey = ResetInterval | "lifetime" | BillingMethod;
const TEN_MINUTES_MS = 10 * 60 * 1000;

// Keys are ResetInterval values (eg. "hour", "month"), billing methods
// (`prepaid`, `usage_based`), or "lifetime" for null-reset buckets.
type BreakdownExpectation = Partial<Record<BreakdownKey, BucketExpectation>>;

export const expectBalanceCorrect = ({
	customer,
	featureId,
	remaining,
	planId,
	usage,
	nextResetAt,
	toleranceMs = TEN_MINUTES_MS,
	breakdown,
	rollovers,
}: {
	customer: ApiCustomerV5 | ApiEntityV2;
	featureId: string;
	remaining: number;
	planId?: string | null;
	usage?: number;
	nextResetAt?: number | null;
	toleranceMs?: number;
	breakdown?: BreakdownExpectation;
	/** Expected rollovers in order (oldest first). Only specified fields are checked. */
	rollovers?: Partial<ApiBalanceRollover>[];
}) => {
	const balance = customer.balances[featureId];
	expect(balance).toBeDefined();
	expect(roundTo8Dp(balance.remaining)).toBe(roundTo8Dp(remaining));

	if (typeof planId !== "undefined") {
		expect(balance.breakdown?.[0]?.plan_id ?? null).toBe(planId);
	}

	if (typeof usage !== "undefined") {
		expect(roundTo8Dp(balance.usage)).toBe(roundTo8Dp(usage));
	}

	if (typeof nextResetAt !== "undefined") {
		if (nextResetAt === null) {
			expect(balance.next_reset_at).toBeNull();
		} else {
			expect(balance.next_reset_at).not.toBeNull();

			const actualNextResetAt = balance.next_reset_at ?? 0;
			const diff = Math.abs(actualNextResetAt - nextResetAt);

			expect(
				diff,
				`next_reset_at mismatch for ${featureId}: expected ${formatMs(nextResetAt)}, got ${formatMs(actualNextResetAt)}`,
			).toBeLessThanOrEqual(toleranceMs);
		}
	}

	if (breakdown) {
		const buckets = balance.breakdown;
		expect(buckets).toBeDefined();

		for (const [key, expectation] of Object.entries(breakdown)) {
			const bucket =
				key === "lifetime"
					? buckets?.find((candidateBucket) => candidateBucket.reset === null)
					: key === BillingMethod.Prepaid || key === BillingMethod.UsageBased
						? buckets?.find(
								(candidateBucket) =>
									candidateBucket.price?.billing_method === key,
							)
						: buckets?.find(
								(candidateBucket) => candidateBucket.reset?.interval === key,
							);

			expect(bucket).toBeDefined();
			expect(bucket).toMatchObject(expectation as BucketExpectation);
		}
	}

	if (rollovers) {
		const actual = balance.rollovers;
		expect(actual?.length).toBe(rollovers.length);
		for (let i = 0; i < rollovers.length; i++) {
			expect(actual![i]).toMatchObject(rollovers[i]);
		}
	}
};
