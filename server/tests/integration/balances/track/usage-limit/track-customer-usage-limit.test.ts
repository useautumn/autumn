import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type CustomerBillingControls,
	EntInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { syncItemV4 } from "@/internal/balances/utils/sync/syncItemV4.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";

// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
const queryRows = (result: unknown): any[] =>
	// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
	Array.isArray(result) ? result : ((result as { rows?: any[] })?.rows ?? []);

type AutumnV2_1Client = Awaited<ReturnType<typeof initScenario>>["autumnV2_1"];
type TestContext = Awaited<ReturnType<typeof initScenario>>["ctx"];

type UsageWindowSyncEntry = {
	customer_entitlement_id: string;
	feature_id: string;
	balance: number;
	adjustment: number;
	entities: null;
	usage_windows: {
		id: string;
		feature_id: string;
		internal_feature_id: string;
		window_start_at: number;
		window_end_at: number;
		usage: number;
		updated_at: number;
	}[];
	next_reset_at: null;
	entity_count: number;
	cache_version: number;
};

const callSyncBalancesV2 = async ({
	ctx,
	entry,
}: {
	ctx: TestContext;
	entry: UsageWindowSyncEntry;
}) => {
	await ctx.db.execute(sql`
		SELECT * FROM sync_balances_v2(${JSON.stringify({
			customer_entitlement_updates: [entry],
			rollover_updates: [],
		})}::jsonb)
	`);
};

const buildUsageWindowSyncEntry = ({
	customerEntitlementId,
	featureId,
	balance = 0,
	adjustment = 0,
	cacheVersion = 0,
	windows,
}: {
	customerEntitlementId: string;
	featureId: string;
	balance?: number;
	adjustment?: number;
	cacheVersion?: number;
	windows: UsageWindowSyncEntry["usage_windows"];
}): UsageWindowSyncEntry => ({
	customer_entitlement_id: customerEntitlementId,
	feature_id: featureId,
	balance,
	adjustment,
	entities: null,
	usage_windows: windows,
	next_reset_at: null,
	entity_count: 0,
	cache_version: cacheVersion,
});

const getUsageLimitCustomerEntitlement = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: TestContext;
	customerId: string;
	featureId: string;
}) => {
	const row = queryRows(
		await ctx.db.execute(sql`
			SELECT id, internal_feature_id, balance, adjustment, cache_version
			FROM customer_entitlements
			WHERE customer_id = ${customerId} AND feature_id = ${featureId}
			LIMIT 1
		`),
	)[0];
	expect(row?.id).toBeTruthy();
	return row as {
		id: string;
		internal_feature_id: string;
		balance: string | number | null;
		adjustment: string | number | null;
		cache_version: number | null;
	};
};

const getUsageWindowRows = async ({
	ctx,
	customerEntitlementId,
}: {
	ctx: TestContext;
	customerEntitlementId: string;
}) =>
	queryRows(
		await ctx.db.execute(sql`
			SELECT feature_id, internal_feature_id, window_start_at, window_end_at, usage
			FROM usage_windows
			WHERE customer_entitlement_id = ${customerEntitlementId}
			ORDER BY window_start_at ASC
		`),
	);

// Arms a windowed usage cap via spend_limits[].usage_limit (overage off);
// `interval` sets the explicit window override.
const setCustomerUsageLimit = async ({
	autumn,
	customerId,
	featureId,
	limit,
	interval = EntInterval.Month,
}: {
	autumn: AutumnV2_1Client;
	customerId: string;
	featureId: string;
	limit: number;
	interval?: EntInterval;
}) => {
	const billingControls: CustomerBillingControls = {
		spend_limits: [
			{
				feature_id: featureId,
				enabled: false,
				usage_limit: limit,
				usage_limit_interval: interval,
			},
		],
	};

	await timeout(2000);
	await autumn.customers.update(customerId, {
		billing_controls: billingControls,
	});
	await timeout(3000);
};

// Credit system: 100 credits, 1 action1 = 0.2 credits (see v2Features.ts).
// A cap of 5 action1 units consumes only 1 credit, so the cap must clamp the
// 6th unit while ~99 credits remain, proving it's a second, independent
// dimension, not a balance check.
test.concurrent(
	`${chalk.yellowBright("track-customer-usage-limit1: per-feature cap clamps the over-cap unit while credits remain")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-usage-limit",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = `track-customer-usage-limit-1-${Date.now()}`;
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Action1,
			limit: 5,
		});

		// Consume exactly up to the cap: 5 action1 units = 1 credit deducted. Assert
		// the synchronous track response; a re-read races the async write-through.
		const consumed = await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});
		expect(consumed.balances?.[TestFeature.Credits]).toMatchObject({
			feature_id: TestFeature.Credits,
			granted: 100,
			remaining: 99,
			usage: 1,
		});

		// The 6th unit is over the cap, so it clamps to 0: the track succeeds but
		// applies nothing, leaving credits unchanged.
		const overCap = await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 1,
		});
		expect(overCap.balances?.[TestFeature.Credits]).toMatchObject({
			granted: 100,
			remaining: 99,
			usage: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-customer-usage-limit2: credit-pool sub-interval cap (1 credit/day) blocks while monthly credits remain")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-credit-day-cap",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = `track-customer-credit-day-cap-1-${Date.now()}`;
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		// 1 action1 = 0.2 credits, so 5 action1 = exactly 1 credit (the daily cap).
		await setCustomerUsageLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Credits,
			limit: 1,
			interval: EntInterval.Day,
		});

		const consumed = await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});
		expect(consumed.balances?.[TestFeature.Credits]).toMatchObject({
			feature_id: TestFeature.Credits,
			granted: 100,
			remaining: 99,
			usage: 1,
		});

		let blocked = false;
		let blockedCode: string | undefined;
		try {
			await autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: 1,
			});
		} catch (error) {
			blocked = true;
			blockedCode = (error as { code?: string }).code;
		}

		expect(blocked).toBe(true);
		expect(blockedCode).toBe("usage_limit_exceeded");
	},
);

// set_usage must be rejected when the feature has an enforced usage window;
// otherwise it bypasses the hard cap (it carries no window provenance).
test.concurrent(
	`${chalk.yellowBright("track-customer-usage-limit3: set_usage is rejected when the feature has a usage window")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-setusage-guard",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = `track-customer-setusage-guard-1-${Date.now()}`;
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		let blockedCode: string | undefined;
		try {
			await autumnV2_1.balances.update({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				current_balance: 50,
			});
		} catch (error) {
			blockedCode = (error as { code?: string }).code;
		}

		expect(blockedCode).toBe("set_usage_not_allowed_with_usage_limit");
	},
);

// A single spend_limit entry carrying BOTH an overage_limit and a windowed usage
// cap must still clamp on the window (the two caps are independent).
test.concurrent(
	`${chalk.yellowBright("track-customer-usage-limit4: a spend_limit with both overage_limit and a usage window clamps the window")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-compound-cap",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = `track-customer-compound-cap-1-${Date.now()}`;
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		const billingControls: CustomerBillingControls = {
			spend_limits: [
				{
					feature_id: TestFeature.Action1,
					enabled: true,
					overage_limit: 20,
					usage_limit: 5,
					usage_limit_interval: EntInterval.Month,
				},
			],
		};
		await timeout(2000);
		await autumnV2_1.customers.update(customerId, {
			billing_controls: billingControls,
		});
		await timeout(3000);

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});

		// The window cap clamps the over-cap unit to 0 (the overage path is separate),
		// so the track succeeds and credits are unchanged.
		const overCap = await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 1,
		});
		expect(overCap.balances?.[TestFeature.Credits]).toMatchObject({
			remaining: 99,
			usage: 1,
		});
	},
);

// Two concurrent tracks on the SAME customer's SAME window must serialize (Redis
// runs each deduction Lua atomically): combined value exceeds the cap, so the
// second track clamps and the counter reflects exactly the capped usage.
test.concurrent(
	`${chalk.yellowBright("track-customer-usage-limit6: concurrent tracks on one window serialize, total clamped to the cap")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-concurrent-cap",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = `track-customer-concurrent-cap-1-${Date.now()}`;
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		// Cap action1 at 5/month; two concurrent tracks of 5 each => combined 10 > 5.
		await setCustomerUsageLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Action1,
			limit: 5,
		});

		const results = await Promise.allSettled([
			autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: 5,
			}),
			autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: 5,
			}),
		]);

		// Both succeed now (clamp, not reject), but the window clamps the combined
		// applied usage to the cap: one applies 5, the other clamps to 0.
		expect(results.every((result) => result.status === "fulfilled")).toBe(true);

		await timeout(2000);
		const final = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(final.balances?.[TestFeature.Credits]).toMatchObject({
			feature_id: TestFeature.Credits,
			remaining: 99,
			usage: 1,
		});
	},
);

// Write-through: the Redis counter must reach the usage_windows table via the
// shared sync (the other tests assert only the synchronous Redis response).
test.concurrent(
	`${chalk.yellowBright("track-customer-usage-limit-sync: window counter writes through to the usage_windows table")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-uw-sync",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = `track-customer-uw-sync-1-${Date.now()}`;
		const { autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Credits,
			limit: 5,
			interval: EntInterval.Day,
		});

		// 5 action1 = 1 credit; under the 5-credit/day cap. The counter lives on the
		// credits cus-ent (balance dimension).
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});

		const creditsEnt = queryRows(
			await ctx.db.execute(sql`
				SELECT id, internal_feature_id FROM customer_entitlements
				WHERE customer_id = ${customerId} AND feature_id = ${TestFeature.Credits}
				LIMIT 1
			`),
		)[0];
		expect(creditsEnt?.id).toBeTruthy();

		// Drive the async write-through synchronously, then assert the mirrored row.
		await syncItemV4({
			ctx,
			payload: {
				customerId,
				orgId: ctx.org.id,
				env: ctx.env,
				timestamp: Date.now(),
				modifiedCusEntIdsByFeatureId: {
					[TestFeature.Credits]: [creditsEnt.id],
				},
			},
		});

		const windowRows = queryRows(
			await ctx.db.execute(sql`
				SELECT feature_id, internal_feature_id, usage
				FROM usage_windows WHERE customer_entitlement_id = ${creditsEnt.id}
			`),
		);
		expect(windowRows).toHaveLength(1);
		expect(windowRows[0].feature_id).toBe(TestFeature.Credits);
		expect(windowRows[0].internal_feature_id).toBe(
			creditsEnt.internal_feature_id,
		);
		expect(Number(windowRows[0].usage)).toBeCloseTo(1, 5);
	},
);

test.concurrent(
	`${chalk.yellowBright("track-customer-usage-limit-sync: stale sync cannot lower a usage_window counter")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-uw-monotonic",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = `track-customer-uw-monotonic-1-${Date.now()}`;
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		const messagesEnt = await getUsageLimitCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		const windowStart = 1_900_000_000_000;
		const windowEnd = 1_902_592_000_000;
		const baseEntry = {
			customerEntitlementId: messagesEnt.id,
			featureId: TestFeature.Messages,
			balance: Number(messagesEnt.balance ?? 0),
			adjustment: Number(messagesEnt.adjustment ?? 0),
			cacheVersion: messagesEnt.cache_version ?? 0,
		};

		await callSyncBalancesV2({
			ctx,
			entry: buildUsageWindowSyncEntry({
				...baseEntry,
				windows: [
					{
						id: `${messagesEnt.id}:messages:${windowStart}`,
						feature_id: TestFeature.Messages,
						internal_feature_id: messagesEnt.internal_feature_id,
						window_start_at: windowStart,
						window_end_at: windowEnd,
						usage: 10,
						updated_at: windowStart + 10,
					},
				],
			}),
		});

		await callSyncBalancesV2({
			ctx,
			entry: buildUsageWindowSyncEntry({
				...baseEntry,
				windows: [
					{
						id: `${messagesEnt.id}:messages:${windowStart}`,
						feature_id: TestFeature.Messages,
						internal_feature_id: messagesEnt.internal_feature_id,
						window_start_at: windowStart,
						window_end_at: windowEnd,
						usage: 8,
						updated_at: windowStart + 20,
					},
				],
			}),
		});

		const windowRows = await getUsageWindowRows({
			ctx,
			customerEntitlementId: messagesEnt.id,
		});
		expect(windowRows).toHaveLength(1);
		expect(Number(windowRows[0].usage)).toBe(10);
		expect(Number(windowRows[0].window_end_at)).toBe(windowEnd);
	},
);

test.concurrent(
	`${chalk.yellowBright("track-customer-usage-limit-sync: sync prunes windows older than the incoming window")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-uw-prune",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = `track-customer-uw-prune-1-${Date.now()}`;
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		const messagesEnt = await getUsageLimitCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		const closedWindowStart = 1_900_000_000_000;
		const currentWindowStart = 1_902_592_000_000;
		const baseEntry = {
			customerEntitlementId: messagesEnt.id,
			featureId: TestFeature.Messages,
			balance: Number(messagesEnt.balance ?? 0),
			adjustment: Number(messagesEnt.adjustment ?? 0),
			cacheVersion: messagesEnt.cache_version ?? 0,
		};

		await callSyncBalancesV2({
			ctx,
			entry: buildUsageWindowSyncEntry({
				...baseEntry,
				windows: [
					{
						id: `${messagesEnt.id}:messages:${closedWindowStart}`,
						feature_id: TestFeature.Messages,
						internal_feature_id: messagesEnt.internal_feature_id,
						window_start_at: closedWindowStart,
						window_end_at: currentWindowStart,
						usage: 4,
						updated_at: closedWindowStart + 10,
					},
					{
						id: `${messagesEnt.id}:messages:${currentWindowStart}`,
						feature_id: TestFeature.Messages,
						internal_feature_id: messagesEnt.internal_feature_id,
						window_start_at: currentWindowStart,
						window_end_at: currentWindowStart + 2_592_000_000,
						usage: 6,
						updated_at: currentWindowStart + 10,
					},
				],
			}),
		});

		await callSyncBalancesV2({
			ctx,
			entry: buildUsageWindowSyncEntry({
				...baseEntry,
				windows: [
					{
						id: `${messagesEnt.id}:messages:${currentWindowStart}`,
						feature_id: TestFeature.Messages,
						internal_feature_id: messagesEnt.internal_feature_id,
						window_start_at: currentWindowStart,
						window_end_at: currentWindowStart + 2_592_000_000,
						usage: 7,
						updated_at: currentWindowStart + 20,
					},
				],
			}),
		});

		const windowRows = await getUsageWindowRows({
			ctx,
			customerEntitlementId: messagesEnt.id,
		});
		expect(windowRows).toHaveLength(1);
		expect(Number(windowRows[0].window_start_at)).toBe(currentWindowStart);
		expect(Number(windowRows[0].usage)).toBe(7);
	},
);

test.concurrent(
	`${chalk.yellowBright("track-customer-usage-limit-sync: stale closed-window sync cannot delete the current window")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-uw-boundary",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = `track-customer-uw-boundary-1-${Date.now()}`;
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		const messagesEnt = await getUsageLimitCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		const closedWindowStart = 1_900_000_000_000;
		const currentWindowStart = 1_902_592_000_000;
		const currentWindowEnd = currentWindowStart + 2_592_000_000;
		const baseEntry = {
			customerEntitlementId: messagesEnt.id,
			featureId: TestFeature.Messages,
			balance: Number(messagesEnt.balance ?? 0),
			adjustment: Number(messagesEnt.adjustment ?? 0),
			cacheVersion: messagesEnt.cache_version ?? 0,
		};
		const closedWindow = {
			id: `${messagesEnt.id}:messages:${closedWindowStart}`,
			feature_id: TestFeature.Messages,
			internal_feature_id: messagesEnt.internal_feature_id,
			window_start_at: closedWindowStart,
			window_end_at: currentWindowStart,
			usage: 4,
			updated_at: closedWindowStart + 10,
		};
		const currentWindow = {
			id: `${messagesEnt.id}:messages:${currentWindowStart}`,
			feature_id: TestFeature.Messages,
			internal_feature_id: messagesEnt.internal_feature_id,
			window_start_at: currentWindowStart,
			window_end_at: currentWindowEnd,
			usage: 6,
			updated_at: currentWindowStart + 10,
		};

		await callSyncBalancesV2({
			ctx,
			entry: buildUsageWindowSyncEntry({
				...baseEntry,
				windows: [closedWindow],
			}),
		});

		await callSyncBalancesV2({
			ctx,
			entry: buildUsageWindowSyncEntry({
				...baseEntry,
				windows: [currentWindow],
			}),
		});

		await callSyncBalancesV2({
			ctx,
			entry: buildUsageWindowSyncEntry({
				...baseEntry,
				windows: [closedWindow],
			}),
		});

		const windowRows = await getUsageWindowRows({
			ctx,
			customerEntitlementId: messagesEnt.id,
		});
		const currentWindowRow = windowRows.find(
			(row) => Number(row.window_start_at) === currentWindowStart,
		);
		expect(currentWindowRow).toBeTruthy();
		expect(Number(currentWindowRow.usage)).toBe(6);
		expect(Number(currentWindowRow.window_end_at)).toBe(currentWindowEnd);
	},
);

// Deploy-migration safety: a leftover pre-array keyed-map blob must be reset to a
// clean array, never iterated-then-corrupted into a JSON object that wedges sync.
test.concurrent(
	`${chalk.yellowBright("track-customer-usage-limit-legacy: a pre-array keyed-map blob is reset, not corrupted into an object")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-uw-legacy",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = `track-customer-uw-legacy-1-${Date.now()}`;
		const { autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Credits,
			limit: 5,
			interval: EntInterval.Day,
		});

		// One track creates a proper array blob on the credits cus-ent.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 1,
		});

		const creditsEnt = queryRows(
			await ctx.db.execute(sql`
				SELECT id FROM customer_entitlements
				WHERE customer_id = ${customerId} AND feature_id = ${TestFeature.Credits}
				LIMIT 1
			`),
		)[0];
		expect(creditsEnt?.id).toBeTruthy();

		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId: TestFeature.Credits,
		});

		// Overwrite usage_windows with a LEGACY keyed-map shape (the pre-array format
		// ipairs would skip and table.insert would corrupt into a JSON object).
		const blobJson = await ctx.redisV2.hget(balanceKey, creditsEnt.id);
		expect(blobJson).toBeTruthy();
		const blob = JSON.parse(blobJson as string);
		blob.usage_windows = {
			"customer:balance:credits:day:legacy": {
				key: "customer:balance:credits:day:legacy",
				usage_amount: 0.2,
				window_start_at: 1_700_000_000_000,
				window_end_at: 9_999_999_999_999,
				dimension_type: "balance",
				interval: "day",
			},
		};
		await ctx.redisV2.hset(balanceKey, creditsEnt.id, JSON.stringify(blob));

		// The next track must RESET the map blob to a clean array, not corrupt it.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 1,
		});

		const after = JSON.parse(
			(await ctx.redisV2.hget(balanceKey, creditsEnt.id)) as string,
		);
		// The poison case is a JSON OBJECT (string keys); it must be a clean array.
		expect(Array.isArray(after.usage_windows)).toBe(true);
		expect(after.usage_windows).toHaveLength(1);
		expect(after.usage_windows[0].feature_id).toBe(TestFeature.Credits);
		expect(typeof after.usage_windows[0].id).toBe("string");
	},
);

// No manual sync flush: the counter must survive the mutation's cache invalidation on
// its own, else the cap silently resets and hands out fresh headroom.
test(
	`${chalk.yellowBright("track-customer-usage-limit-lowercap: lowering the cap below current usage keeps the counter (clamps, no reset)")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-uw-lowercap",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const customerId = `track-customer-uw-lowercap-1-${Date.now()}`;
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			limit: 10,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 8,
		});

		await autumnV2_1.customers.update(customerId, {
			billing_controls: {
				spend_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: false,
						usage_limit: 3,
						usage_limit_interval: EntInterval.Month,
					},
				],
			},
		});

		const clamped = await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		});
		expect(clamped.balance).toMatchObject({
			remaining: 992,
			usage: 8,
		});
	},
);

// Bug 1: a second balance grant (balances.create) is a cache-invalidating mutation;
// the cap counter must survive it. It used to reset to 0, opening fresh headroom.
test(
	`${chalk.yellowBright("track-customer-usage-limit-regrant: the cap counter survives a re-grant (clamps)")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-uw-regrant",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = `track-customer-uw-regrant-1-${Date.now()}`;
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});

		const clampedBefore = await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		});
		expect(clampedBefore.balance).toMatchObject({ usage: 5 });

		// Re-grant a second balance for the same feature while at the cap.
		await autumnV2_1.post("/balances.create", {
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 100,
			reset: { interval: EntInterval.Month },
		});

		const clampedAfter = await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		});
		expect(clampedAfter.balance).toMatchObject({ usage: 5 });
	},
);

// Q1 clamp: an over-cap track applies what fits (the remaining headroom) instead of
// rejecting the whole track. cap 5, track 10 from 0 -> applies 5 (not 10, not a 400).
test(
	`${chalk.yellowBright("track-customer-usage-limit-clamp: over-cap track applies what fits (clamp, not reject)")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-uw-clamp",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = `track-customer-uw-clamp-1-${Date.now()}`;
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		// Track 10 against a cap of 5 (from 0): clamps to 5, returns 200, not a reject.
		const clamped = await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		expect(clamped.value).toBe(10);
		expect(clamped.balance).toMatchObject({ remaining: 95, usage: 5 });

		// At the cap: a further track applies 0 (fully clamped), still 200.
		const atCap = await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});
		expect(atCap.balance).toMatchObject({ remaining: 95, usage: 5 });
	},
);

// Q2: the spend_limit in the customer response exposes the current window usage.
test(
	`${chalk.yellowBright("track-customer-usage-limit-counter: spend_limit exposes the current window usage")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-uw-counter",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = `track-customer-uw-counter-1-${Date.now()}`;
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		const customer = (await autumnV2_1.get(
			`/customers/${customerId}`,
		)) as ApiCustomerV5;
		const limit = customer.billing_controls?.spend_limits?.find(
			(entry) => entry.feature_id === TestFeature.Messages,
		);
		expect(limit?.usage_limit_used).toBe(3);
	},
);

// Q1 clamp - partial fill: a track larger than the remaining headroom applies only
// what fits (not the whole value, not 0), fractional remainders included.
test(
	`${chalk.yellowBright("track-customer-usage-limit-partial: an over-cap track fills the remaining headroom")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-uw-partial",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const customerId = `track-customer-uw-partial-1-${Date.now()}`;
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		// Only 2 headroom left; a fractional 2.5 fills exactly 2 (usage -> 5), not 2.5.
		const partial = await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2.5,
		});
		expect(partial.balance).toMatchObject({ usage: 5, remaining: 995 });

		// At the cap, a huge over-cap track applies 0.
		const large = await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1000,
		});
		expect(large.balance).toMatchObject({ usage: 5, remaining: 995 });
	},
);

// Q1 clamp under concurrency: many simultaneous over-cap tracks all succeed (clamp,
// not reject), but the window applies at most the cap total - no over-count.
test(
	`${chalk.yellowBright("track-customer-usage-limit-clamp-race: concurrent over-cap tracks clamp to the cap total")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-uw-clamp-race",
			items: [items.monthlyMessages({ includedUsage: 100000 })],
		});

		const customerId = `track-customer-uw-clamp-race-1-${Date.now()}`;
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			limit: 10,
		});

		const results = await Promise.allSettled(
			Array.from({ length: 40 }, () =>
				autumnV2_1.track({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
				}),
			),
		);
		// Every track succeeds (clamp, never a usage_limit_exceeded reject)...
		expect(results.every((result) => result.status === "fulfilled")).toBe(true);

		// ...but the window applied exactly the cap of 10 - no over-count from the race.
		await timeout(2000);
		const final = await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 0,
		});
		expect(final.balance).toMatchObject({ usage: 10, remaining: 99990 });
	},
);
