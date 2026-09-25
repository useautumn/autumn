import { describe, expect, test } from "bun:test";
import type { RolloutConfig } from "@/internal/misc/rollouts/rolloutSchemas.js";
import {
	ACTIVE_ROLLOUT_ID,
	getCustomerBucket,
	isRolloutCacheStale,
	isRolloutEnabled,
	ROLLOUT_SETTLE_MS,
} from "@/internal/misc/rollouts/rolloutUtils.js";

const ORG_ID = "org_test";
const CHANGED_AT = 1_700_000_000_000;
const SETTLED = CHANGED_AT + ROLLOUT_SETTLE_MS;
const UNSETTLED = CHANGED_AT + 1_000;

const customerInBucketRange = ({
	min,
	max,
}: {
	min: number;
	max: number;
}): string => {
	for (let i = 0; i < 10_000; i++) {
		const customerId = `cus_${i}`;
		const bucket = getCustomerBucket({ customerId });
		if (bucket >= min && bucket < max) return customerId;
	}
	throw new Error(`No customer found in bucket range [${min}, ${max})`);
};

const configWith = ({
	percent,
	previousPercent,
	changedAt = CHANGED_AT,
	orgs = {},
	rolloutId = ACTIVE_ROLLOUT_ID,
}: {
	percent: number;
	previousPercent: number;
	changedAt?: number;
	orgs?: RolloutConfig["rollouts"][string]["orgs"];
	rolloutId?: string;
}): RolloutConfig => ({
	rollouts: {
		[rolloutId]: {
			percent,
			previousPercent,
			changedAt,
			decreases:
				percent < previousPercent
					? [{ from: previousPercent, to: percent, at: changedAt }]
					: [],
			orgs,
		},
	},
});

const bucket40s = customerInBucketRange({ min: 40, max: 50 });
const bucket10s = customerInBucketRange({ min: 10, max: 20 });
const bucket70s = customerInBucketRange({ min: 70, max: 80 });

const enabledFor = ({
	customerId,
	now,
	config,
}: {
	customerId?: string;
	now: number;
	config: RolloutConfig;
}) =>
	isRolloutEnabled({
		rolloutId: ACTIVE_ROLLOUT_ID,
		orgId: ORG_ID,
		customerId,
		now,
		config,
	});

const staleFor = ({
	customerId,
	cachedAt,
	now,
	config,
}: {
	customerId: string;
	cachedAt?: number;
	now: number;
	config: RolloutConfig;
}) =>
	isRolloutCacheStale({
		rolloutId: ACTIVE_ROLLOUT_ID,
		orgId: ORG_ID,
		customerId,
		cachedAt,
		now,
		config,
	});

describe("isRolloutEnabled", () => {
	const forward = configWith({ percent: 100, previousPercent: 0 });

	test("routes by the previous percent until the change settles", () => {
		expect(
			enabledFor({ customerId: bucket40s, now: UNSETTLED, config: forward }),
		).toBe(false);
	});

	test("routes by the new percent once settled", () => {
		expect(
			enabledFor({ customerId: bucket40s, now: SETTLED, config: forward }),
		).toBe(true);
	});

	test("a rollout id with no entry is disabled", () => {
		expect(
			enabledFor({
				customerId: bucket40s,
				now: SETTLED,
				config: configWith({
					percent: 100,
					previousPercent: 0,
					rolloutId: "other",
				}),
			}),
		).toBe(false);
	});

	test("an org override beats the global entry", () => {
		const config = configWith({
			percent: 0,
			previousPercent: 0,
			orgs: {
				[ORG_ID]: {
					percent: 100,
					previousPercent: 0,
					changedAt: CHANGED_AT,
					decreases: [],
				},
			},
		});
		expect(enabledFor({ customerId: bucket40s, now: SETTLED, config })).toBe(
			true,
		);
		expect(
			isRolloutEnabled({
				rolloutId: ACTIVE_ROLLOUT_ID,
				orgId: "org_other",
				customerId: bucket40s,
				now: SETTLED,
				config,
			}),
		).toBe(false);
	});

	test("a partial percent splits customers by bucket", () => {
		const config = configWith({ percent: 50, previousPercent: 50 });
		expect(enabledFor({ customerId: bucket10s, now: SETTLED, config })).toBe(
			true,
		);
		expect(enabledFor({ customerId: bucket70s, now: SETTLED, config })).toBe(
			false,
		);
	});

	test.each([
		{ percent: 100, enabled: true },
		{ percent: 50, enabled: false },
	])(
		"without a customer, percent $percent is enabled=$enabled",
		({ percent, enabled }) => {
			expect(
				enabledFor({
					now: SETTLED,
					config: configWith({ percent, previousPercent: percent }),
				}),
			).toBe(enabled);
		},
	);
});

describe("isRolloutCacheStale", () => {
	const back = configWith({ percent: 0, previousPercent: 100 });

	test("a view from before the bucket came back to legacy is stale", () => {
		expect(
			staleFor({
				customerId: bucket40s,
				cachedAt: SETTLED - 1,
				now: SETTLED,
				config: back,
			}),
		).toBe(true);
	});

	test("a view rebuilt after the bucket came back is fresh", () => {
		expect(
			staleFor({
				customerId: bucket40s,
				cachedAt: SETTLED,
				now: SETTLED,
				config: back,
			}),
		).toBe(false);
		expect(
			staleFor({
				customerId: bucket40s,
				cachedAt: SETTLED + 1,
				now: SETTLED + 60_000,
				config: back,
			}),
		).toBe(false);
	});

	test("nothing is stale before the decrease settles", () => {
		expect(
			staleFor({
				customerId: bucket40s,
				cachedAt: 1,
				now: UNSETTLED,
				config: back,
			}),
		).toBe(false);
	});

	test("a bucket that was never on the worker is never stale", () => {
		const halfBack = configWith({ percent: 0, previousPercent: 50 });
		expect(
			staleFor({
				customerId: bucket70s,
				cachedAt: 1,
				now: SETTLED,
				config: halfBack,
			}),
		).toBe(false);
		expect(
			staleFor({
				customerId: bucket10s,
				cachedAt: 1,
				now: SETTLED,
				config: halfBack,
			}),
		).toBe(true);
	});

	test("an increase evicts nothing", () => {
		const forward = configWith({ percent: 100, previousPercent: 0 });
		expect(
			staleFor({
				customerId: bucket40s,
				cachedAt: 1,
				now: SETTLED,
				config: forward,
			}),
		).toBe(false);
	});

	test("stepwise rollback: each bucket is evicted once, by the decrease that sent it back", () => {
		const day = 86_400_000;
		const config: RolloutConfig = {
			rollouts: {
				[ACTIVE_ROLLOUT_ID]: {
					percent: 0,
					previousPercent: 50,
					changedAt: CHANGED_AT + day,
					decreases: [
						{ from: 100, to: 50, at: CHANGED_AT },
						{ from: 50, to: 0, at: CHANGED_AT + day },
					],
					orgs: {},
				},
			},
		};
		const afterBoth = CHANGED_AT + day + ROLLOUT_SETTLE_MS;
		const rebuiltAfterDayOne = CHANGED_AT + ROLLOUT_SETTLE_MS;
		// bucket 70 left on day one: a view from before is stale, one rebuilt after day one is not.
		expect(
			staleFor({
				customerId: bucket70s,
				cachedAt: CHANGED_AT - 1,
				now: afterBoth,
				config,
			}),
		).toBe(true);
		expect(
			staleFor({
				customerId: bucket70s,
				cachedAt: rebuiltAfterDayOne,
				now: afterBoth,
				config,
			}),
		).toBe(false);
		// bucket 10 left on day two: a view rebuilt after day one is still stale.
		expect(
			staleFor({
				customerId: bucket10s,
				cachedAt: rebuiltAfterDayOne,
				now: afterBoth,
				config,
			}),
		).toBe(true);
	});

	test("a crossed bucket with no cache timestamp is stale", () => {
		expect(
			staleFor({ customerId: bucket40s, now: SETTLED, config: back }),
		).toBe(true);
	});

	test("an entry that never decreased, or no entry at all, is never stale", () => {
		expect(
			staleFor({
				customerId: bucket40s,
				cachedAt: 1,
				now: SETTLED,
				config: configWith({
					percent: 100,
					previousPercent: 100,
					changedAt: 0,
				}),
			}),
		).toBe(false);
		expect(
			staleFor({
				customerId: bucket40s,
				cachedAt: 1,
				now: SETTLED,
				config: { rollouts: {} },
			}),
		).toBe(false);
	});
});
