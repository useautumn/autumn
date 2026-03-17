import { expect } from "bun:test";
import type {
	ApiBalanceRollover,
	ApiCustomerV5,
	ResetInterval,
} from "@autumn/shared";

type BucketExpectation = {
	included_grant?: number;
	remaining?: number;
	usage?: number;
};

// Keys are ResetInterval values (eg. "hour", "month") or "lifetime" for null-reset buckets.
type BreakdownExpectation = Partial<
	Record<ResetInterval | "lifetime", BucketExpectation>
>;

export const expectBalanceCorrect = ({
	customer,
	featureId,
	remaining,
	planId,
	usage,
	breakdown,
	rollovers,
}: {
	customer: ApiCustomerV5;
	featureId: string;
	remaining: number;
	planId?: string | null;
	usage?: number;
	breakdown?: BreakdownExpectation;
	/** Expected rollovers in order (oldest first). Only specified fields are checked. */
	rollovers?: Partial<ApiBalanceRollover>[];
}) => {
	const balance = customer.balances[featureId];
	expect(balance).toBeDefined();
	expect(balance.remaining).toBe(remaining);

	if (typeof planId !== "undefined") {
		expect(balance.breakdown?.[0]?.plan_id ?? null).toBe(planId);
	}

	if (typeof usage !== "undefined") {
		expect(balance.usage).toBe(usage);
	}

	if (breakdown) {
		const buckets = balance.breakdown;
		expect(buckets).toBeDefined();

		for (const [key, expectation] of Object.entries(breakdown)) {
			const bucket =
				key === "lifetime"
					? buckets?.find((b) => b.reset === null)
					: buckets?.find((b) => b.reset?.interval === key);
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
