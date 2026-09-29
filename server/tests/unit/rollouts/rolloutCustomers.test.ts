import { describe, expect, test } from "bun:test";
import {
	assertRolloutInactive,
	pruneExpiredCustomerRemovals,
	scheduleCustomerAdd,
	scheduleCustomerRemoval,
} from "@/internal/misc/rollouts/rolloutConfigStore.js";
import type {
	RolloutConfig,
	RolloutCustomer,
	RolloutEntry,
} from "@/internal/misc/rollouts/rolloutSchemas.js";
import {
	ACTIVE_ROLLOUT_ID,
	getCustomerBucket,
	isRolloutCacheStale,
	isRolloutEnabled,
	ROLLOUT_SETTLE_MS,
} from "@/internal/misc/rollouts/rolloutUtils.js";

const ORG_ID = "org_test";
const OTHER_ORG_ID = "org_other";
const CUSTOMER_ID = "cus_pinned";
const OTHER_CUSTOMER_ID = "cus_unpinned";
const T = 1_700_000_000_000;
const DAY = 86_400_000;
const ADD_LANDS = T + ROLLOUT_SETTLE_MS;

const entryWith = ({
	percent = 0,
	orgs = {},
	customers = {},
}: {
	percent?: number;
	orgs?: RolloutEntry["orgs"];
	customers?: RolloutEntry["customers"];
}): RolloutEntry => ({
	percent,
	previousPercent: percent,
	changedAt: 0,
	decreases: [],
	orgs,
	customers,
});

const configWith = ({
	customer,
	percent = 0,
	decreases = [],
}: {
	customer: RolloutCustomer;
	percent?: number;
	decreases?: RolloutEntry["decreases"];
}): RolloutConfig => ({
	rollouts: {
		[ACTIVE_ROLLOUT_ID]: {
			...entryWith({
				percent,
				customers: { [ORG_ID]: { [CUSTOMER_ID]: customer } },
			}),
			decreases,
		},
	},
});

const enabledFor = ({
	customerId = CUSTOMER_ID,
	orgId = ORG_ID,
	now,
	config,
}: {
	customerId?: string;
	orgId?: string;
	now: number;
	config: RolloutConfig;
}) =>
	isRolloutEnabled({
		rolloutId: ACTIVE_ROLLOUT_ID,
		orgId,
		customerId,
		now,
		config,
	});

const staleFor = ({
	cachedAt,
	now,
	config,
}: {
	cachedAt?: number;
	now: number;
	config: RolloutConfig;
}) =>
	isRolloutCacheStale({
		rolloutId: ACTIVE_ROLLOUT_ID,
		orgId: ORG_ID,
		customerId: CUSTOMER_ID,
		cachedAt,
		now,
		config,
	});

describe("isRolloutEnabled with a pinned customer", () => {
	const pinned = configWith({ customer: { addedAt: T } });

	test("the customer follows the org percent until the add lands, then routes to the worker", () => {
		expect(enabledFor({ now: ADD_LANDS - 1, config: pinned })).toBe(false);
		expect(enabledFor({ now: ADD_LANDS, config: pinned })).toBe(true);
	});

	test("only that customer in that org is pinned", () => {
		expect(
			enabledFor({
				customerId: OTHER_CUSTOMER_ID,
				now: ADD_LANDS,
				config: pinned,
			}),
		).toBe(false);
		expect(
			enabledFor({ orgId: OTHER_ORG_ID, now: ADD_LANDS, config: pinned }),
		).toBe(false);
	});

	test("a request with no customer id ignores pins", () => {
		expect(
			isRolloutEnabled({
				rolloutId: ACTIVE_ROLLOUT_ID,
				orgId: ORG_ID,
				now: ADD_LANDS,
				config: pinned,
			}),
		).toBe(false);
	});

	test("a removed customer stays on the worker until the removal lands, then follows the org percent", () => {
		const removedAt = T + DAY;
		const removed = configWith({ customer: { addedAt: T, removedAt } });
		expect(
			enabledFor({ now: removedAt + ROLLOUT_SETTLE_MS - 1, config: removed }),
		).toBe(true);
		expect(
			enabledFor({ now: removedAt + ROLLOUT_SETTLE_MS, config: removed }),
		).toBe(false);

		const orgOnWorker = configWith({
			customer: { addedAt: T, removedAt },
			percent: 100,
		});
		expect(
			enabledFor({ now: removedAt + ROLLOUT_SETTLE_MS, config: orgOnWorker }),
		).toBe(true);
	});
});

describe("isRolloutCacheStale with a pinned customer", () => {
	const removedAt = T + DAY;
	const cameBackAt = removedAt + ROLLOUT_SETTLE_MS;
	const removed = configWith({ customer: { addedAt: T, removedAt } });

	test("a view from before the removal landed is stale", () => {
		expect(
			staleFor({ cachedAt: T - 1, now: cameBackAt, config: removed }),
		).toBe(true);
		expect(staleFor({ now: cameBackAt, config: removed })).toBe(true);
	});

	test("a view rebuilt after the removal landed is fresh", () => {
		expect(
			staleFor({ cachedAt: cameBackAt, now: cameBackAt + 1, config: removed }),
		).toBe(false);
	});

	test("nothing is stale before the removal lands or while still pinned", () => {
		expect(
			staleFor({ cachedAt: 1, now: cameBackAt - 1, config: removed }),
		).toBe(false);
		expect(
			staleFor({
				cachedAt: 1,
				now: ADD_LANDS,
				config: configWith({ customer: { addedAt: T } }),
			}),
		).toBe(false);
	});

	test("the org's decreases still apply to a pinned customer", () => {
		const bucket = getCustomerBucket({ customerId: CUSTOMER_ID });
		const decreased = configWith({
			customer: { addedAt: T + DAY },
			decreases: [{ from: bucket + 1, to: bucket, at: T }],
		});
		expect(staleFor({ cachedAt: 1, now: ADD_LANDS, config: decreased })).toBe(
			true,
		);
	});
});

describe("scheduleCustomerAdd", () => {
	test("a new customer is added now", () => {
		expect(scheduleCustomerAdd({ current: undefined, now: T })).toEqual({
			addedAt: T,
		});
	});

	test("adding a pinned customer again changes nothing", () => {
		const current = { addedAt: T };
		expect(scheduleCustomerAdd({ current, now: T + DAY })).toEqual(current);
	});

	test("re-adding before the removal lands cancels it and keeps the add time", () => {
		expect(
			scheduleCustomerAdd({
				current: { addedAt: T, removedAt: T + DAY },
				now: T + DAY + ROLLOUT_SETTLE_MS - 1,
			}),
		).toEqual({ addedAt: T });
	});

	test("re-adding after the removal landed starts a new add", () => {
		const now = T + DAY + ROLLOUT_SETTLE_MS;
		expect(
			scheduleCustomerAdd({
				current: { addedAt: T, removedAt: T + DAY },
				now,
			}),
		).toEqual({ addedAt: now });
	});
});

describe("scheduleCustomerRemoval", () => {
	test("a pinned customer is removed now", () => {
		expect(
			scheduleCustomerRemoval({ current: { addedAt: T }, now: T + DAY }),
		).toEqual({ addedAt: T, removedAt: T + DAY });
	});

	test("removing again keeps the first removal time", () => {
		const current = { addedAt: T, removedAt: T + DAY };
		expect(scheduleCustomerRemoval({ current, now: T + 2 * DAY })).toEqual(
			current,
		);
	});
});

describe("pruneExpiredCustomerRemovals", () => {
	test("removals are kept while a pre-removal view could exist, then dropped with their emptied org", () => {
		const customers: RolloutEntry["customers"] = {
			[ORG_ID]: {
				[CUSTOMER_ID]: { addedAt: T },
				[OTHER_CUSTOMER_ID]: { addedAt: T, removedAt: T },
			},
			[OTHER_ORG_ID]: { [CUSTOMER_ID]: { addedAt: T, removedAt: T } },
		};
		expect(
			pruneExpiredCustomerRemovals({ customers, now: T + 2 * DAY }),
		).toEqual(customers);
		expect(
			pruneExpiredCustomerRemovals({ customers, now: T + 4 * DAY }),
		).toEqual({ [ORG_ID]: { [CUSTOMER_ID]: { addedAt: T } } });
	});
});

describe("assertRolloutInactive with customers", () => {
	test("a pinned customer is refused even when every percent is 0", () => {
		expect(() =>
			assertRolloutInactive({
				rolloutId: ACTIVE_ROLLOUT_ID,
				entry: entryWith({
					customers: { [ORG_ID]: { [CUSTOMER_ID]: { addedAt: T } } },
				}),
			}),
		).toThrow(/still active/);
	});

	test("only removed customers pass", () => {
		expect(() =>
			assertRolloutInactive({
				rolloutId: ACTIVE_ROLLOUT_ID,
				entry: entryWith({
					customers: {
						[ORG_ID]: { [CUSTOMER_ID]: { addedAt: T, removedAt: T } },
					},
				}),
			}),
		).not.toThrow();
	});
});
