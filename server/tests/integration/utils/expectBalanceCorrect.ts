import { expect } from "bun:test";
import {
	type ApiBalanceRollover,
	type ApiCustomerV5,
	type ApiEntityV2,
	ApiVersion,
	BillingMethod,
	formatMs,
	type ResetInterval,
} from "@autumn/shared";
import {
	type PollableExpectParams,
	pollableCustomerExpect,
} from "@tests/utils/pollableCustomerExpect.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const roundTo8Dp = (value: number) => Math.round(value * 1e8) / 1e8;

type BucketExpectation = {
	granted?: number;
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

type BalanceExpectParams = PollableExpectParams<ApiCustomerV5 | ApiEntityV2> & {
	featureId: string;
	granted?: number;
	includedGrant?: number;
	remaining?: number;
	planId?: string | null;
	usage?: number;
	nextResetAt?: number | null;
	toleranceMs?: number;
	breakdown?: BreakdownExpectation;
	/** Expected rollovers in order (oldest first). Only specified fields are checked. */
	rollovers?: Partial<ApiBalanceRollover>[];
	positiveRolloverCount?: number;
	breakdownCount?: number;
	breakdownId?: string;
};

const assertBalanceCorrect = ({
	customer,
	featureId,
	granted,
	includedGrant,
	remaining,
	planId,
	usage,
	nextResetAt,
	toleranceMs = TEN_MINUTES_MS,
	breakdown,
	rollovers,
	positiveRolloverCount,
	breakdownCount,
	breakdownId,
}: BalanceExpectParams & { customer: ApiCustomerV5 | ApiEntityV2 }) => {
	const balance = customer.balances[featureId];
	expect(balance).toBeDefined();

	if (typeof granted !== "undefined") {
		expect(roundTo8Dp(balance.granted)).toBe(roundTo8Dp(granted));
	}

	if (typeof includedGrant !== "undefined") {
		expect(roundTo8Dp(balance.breakdown?.[0]?.included_grant ?? 0)).toBe(
			roundTo8Dp(includedGrant),
		);
	}

	if (typeof remaining !== "undefined") {
		expect(roundTo8Dp(balance.remaining)).toBe(roundTo8Dp(remaining));
	}

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

			expect(
				bucket,
				`Missing balance bucket ${key}: ${JSON.stringify(buckets)}`,
			).toBeDefined();
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

	if (typeof positiveRolloverCount !== "undefined") {
		const actual = balance.rollovers ?? [];
		expect(actual.filter((item) => item.balance > 0).length).toBe(
			positiveRolloverCount,
		);
	}

	if (typeof breakdownCount !== "undefined") {
		expect(balance.breakdown).toHaveLength(breakdownCount);
	}

	if (typeof breakdownId !== "undefined") {
		expect(balance.breakdown?.[0]?.id).toBe(breakdownId);
	}
};

const defaultAutumn = new AutumnInt({ version: ApiVersion.V2_1 });

/**
 * Assert a feature balance. Pass `customerId` (instead of a fetched `customer`)
 * to poll until it settles — see {@link pollableCustomerExpect}.
 */
export const expectBalanceCorrect = pollableCustomerExpect({
	fetchCustomer: ({
		customerId,
		entityId,
		skipCache,
		autumn,
	}: BalanceExpectParams): Promise<ApiCustomerV5 | ApiEntityV2> => {
		const client = autumn ?? defaultAutumn;
		const query = skipCache ? { skip_cache: "true" } : undefined;
		return entityId
			? client.entities.get<ApiEntityV2>(customerId!, entityId, query)
			: client.customers.get<ApiCustomerV5>(customerId!, query);
	},
	assert: assertBalanceCorrect,
});
