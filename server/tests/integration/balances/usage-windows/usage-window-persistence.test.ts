import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiVersion,
	EntInterval,
	ResetInterval,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { expectUsageLimitCorrect } from "@tests/integration/utils/expectUsageLimitCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import {
	expectCustomerBalance,
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "../utils/usage-limit-utils/customerUsageLimitUtils.js";
import { expireUsageWindowForReset } from "../utils/usage-limit-utils/expireUsageWindowForReset.js";

// Usage-window PERSISTENCE: the counter's fate across cache-invalidating
// events (config changes, re-grants, plan replacement) and cache loss. The
// counter survives via the batched Redis->PG sync + rebuild rehydration, so
// these tests wait ~4s after capped tracks before invalidating mutations.

// initScenario only exposes clients up to V2_2; build the latest-version client
// directly (same pattern as the v2.2-vs-v2.3 parity tests).
const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
const queryRows = (result: unknown): any[] =>
	// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
	Array.isArray(result) ? result : ((result as { rows?: any[] })?.rows ?? []);

// No manual sync flush: the counter must survive the mutation's cache
// invalidation on its own, else the cap silently resets and hands out fresh
// headroom.
test.concurrent(
	`${chalk.yellowBright("usage-window-persistence1: lowering the cap below current usage keeps the counter (clamps, no reset)")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-persist-lowercap",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const customerId = "uw-persist-lowercap-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 10,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 8,
		});

		// Let the batched sync flush the counter to Postgres before the
		// cache-invalidating mutation (the rebuild rehydrates from PG).
		await timeout(4000);

		await autumnV2_3.customers.update(customerId, {
			billing_controls: {
				usage_limits: [
					{
						feature_id: TestFeature.Messages,
						limit: 3,
						interval: ResetInterval.Month,
					},
				],
			},
		});

		// The counter survived the cap change, so the next track fully clamps.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 992,
			usage: 8,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 8,
			limit: 3,
		});

		// Write-through: after the sync flush, the same state must come back from
		// Postgres (skip_cache bypasses Redis entirely).
		await timeout(4000);
		const fromDb = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expectBalanceCorrect({
			customer: fromDb,
			featureId: TestFeature.Messages,
			remaining: 992,
			usage: 8,
		});
		expectUsageLimitCorrect({
			customer: fromDb,
			featureId: TestFeature.Messages,
			usage: 8,
			limit: 3,
		});
	},
);

// A second balance grant (balances.create) is a cache-invalidating mutation;
// the cap counter must survive it. It used to reset to 0, opening fresh
// headroom.
test.concurrent(
	`${chalk.yellowBright("usage-window-persistence2: the cap counter survives a re-grant (clamps)")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-persist-regrant",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-persist-regrant-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
		});

		// Let the batched sync flush the counter to Postgres before the
		// cache-invalidating mutation (the rebuild rehydrates from PG).
		await timeout(4000);

		// Re-grant a second balance for the same feature while at the cap.
		await autumnV2_3.post("/balances.create", {
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 100,
			reset: { interval: EntInterval.Month },
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});

		// Write-through: the post-regrant counter must come back from Postgres.
		await timeout(4000);
		const fromDb = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expectBalanceCorrect({
			customer: fromDb,
			featureId: TestFeature.Messages,
			granted: 200,
			remaining: 195,
			usage: 5,
		});
		expectUsageLimitCorrect({
			customer: fromDb,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});
	},
);

// A missing '_usage_windows' field FAILS OPEN (deliberate for v1): the track
// succeeds and the window simply restarts from zero. This documents the
// accepted trade-off -- a lost counter field grants fresh headroom rather than
// erroring. Stale-cache guards may return in a future iteration.
test.concurrent(
	`${chalk.yellowBright("usage-window-persistence4: missing _usage_windows field fails open (counter restarts)")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-persist-failopen",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-persist-failopen-1";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		// Establish a counter.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
		});

		// Simulate a stale/partial cache: the counter field vanishes while the
		// subject view stays valid.
		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId: TestFeature.Messages,
		});
		await ctx.redisV2.hdel(balanceKey, "_usage_windows");

		// Fail open: the track succeeds; the window restarted, so only this track
		// counts toward the cap (balance itself is unaffected: 3 tracked total).
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		});
		const afterRestart =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterRestart,
			featureId: TestFeature.Messages,
			remaining: 97,
			usage: 3,
		});
		expectUsageLimitCorrect({
			customer: afterRestart,
			featureId: TestFeature.Messages,
			usage: 1,
			limit: 5,
		});

		// Enforcement continues from the restarted counter: headroom is 4, so a
		// track of 5 clamps to 4.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});
		const atCap = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: atCap,
			featureId: TestFeature.Messages,
			remaining: 93,
			usage: 7,
		});
		expectUsageLimitCorrect({
			customer: atCap,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});

		// Write-through: the restarted counter upserts over the pre-restart row
		// (same logical window key) and must come back from Postgres.
		await timeout(4000);
		const fromDb = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expectBalanceCorrect({
			customer: fromDb,
			featureId: TestFeature.Messages,
			remaining: 93,
			usage: 7,
		});
		expectUsageLimitCorrect({
			customer: fromDb,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});
	},
);

// Lazy roll: a counter whose stored window closed must zero IN PLACE on any
// subject read -- and two CONCURRENT reads must both succeed (the roll is
// idempotent: PG update by id, atomic Lua cache patch).
test.concurrent(
	`${chalk.yellowBright("usage-window-persistence5: an expired counter rolls to zero on (concurrent) reads")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-persist-lazyreset",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-persist-lazyreset-1";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
		});

		// Flush, then close the counter's window in both stores.
		await timeout(4000);
		await expireUsageWindowForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		// Concurrent reads: both succeed and both report the rolled count.
		const [customer, concurrentCustomer] = await Promise.all([
			autumnV2_3.customers.get<ApiCustomerV5>(customerId),
			autumnV2_3.customers.get<ApiCustomerV5>(customerId),
		]);
		expectUsageLimitCorrect({
			customer,
			featureId: TestFeature.Messages,
			usage: 0,
			limit: 5,
		});
		expectUsageLimitCorrect({
			customer: concurrentCustomer,
			featureId: TestFeature.Messages,
			usage: 0,
			limit: 5,
		});

		// The row persists, zeroed, with bounds advanced to the live cycle.
		const rows = queryRows(
			await ctx.db.execute(sql`
				SELECT usage, window_end_at FROM usage_windows
				WHERE feature_id = ${TestFeature.Messages}
					AND internal_customer_id = (
						SELECT internal_id FROM customers
						WHERE id = ${customerId} AND org_id = ${ctx.org.id} AND env = ${ctx.env}
						LIMIT 1
					)
			`),
		);
		expect(rows).toHaveLength(1);
		expect(Number(rows[0].usage)).toBe(0);
		expect(Number(rows[0].window_end_at)).toBeGreaterThan(Date.now());
	},
);
