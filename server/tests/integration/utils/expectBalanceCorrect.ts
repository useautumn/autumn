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
	breakdown,
	rollovers,
}: {
	customer: ApiCustomerV5;
	featureId: string;
	remaining: number;
	breakdown?: BreakdownExpectation;
	/** Expected rollovers in order (oldest first). Only specified fields are checked. */
	rollovers?: Partial<ApiBalanceRollover>[];
}) => {
	expect(customer.balances[featureId]).toBeDefined();
	expect(customer.balances[featureId].remaining).toBe(remaining);

	if (breakdown) {
		const buckets = customer.balances[featureId]?.breakdown;
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
		const actual = customer.balances[featureId]?.rollovers;
		expect(actual?.length).toBe(rollovers.length);
		for (let i = 0; i < rollovers.length; i++) {
			expect(actual![i]).toMatchObject(rollovers[i]);
		}
	}
};
