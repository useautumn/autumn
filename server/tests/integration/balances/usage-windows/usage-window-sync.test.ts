import { expect, test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { syncItemV4 } from "@/internal/balances/utils/sync/syncItemV4.js";
import type { UsageWindowUpdate } from "@/internal/balances/utils/types/usageWindowUpdate.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { setCustomerUsageLimit } from "../utils/usage-limit-utils/customerUsageLimitUtils.js";

// Usage-window SYNC & STORAGE: infrastructure state, not track responses.
// Where the counter lives in Redis (the reserved '_usage_windows' field), how
// it writes through to the customer-scoped usage_windows Postgres table, and
// the race-safety contract of that mirror (upsert on the logical key).

// initScenario only exposes clients up to V2_2; build the latest-version client
// directly (same pattern as the v2.2-vs-v2.3 parity tests).
const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
const queryRows = (result: unknown): any[] =>
	// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
	Array.isArray(result) ? result : ((result as { rows?: any[] })?.rows ?? []);

const HOUR_MS = 60 * 60 * 1000;

// Storage shape: the counter lives in the capped feature's balance hash under
// the reserved '_usage_windows' field (customer-scoped rows), NOT inside any
// customer-entitlement blob.
test.concurrent(
	`${chalk.yellowBright("usage-window-sync1: counter lives in the _usage_windows hash field, not the cus-ent blob")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-sync-storage",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-sync-storage-1";
		const { ctx } = await initScenario({
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
			featureId: TestFeature.Credits,
			limit: 5,
			interval: ResetInterval.Day,
		});

		await autumnV2_3.track({
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

		// Counter: one customer-scoped row in the reserved field, in credits units
		// (1 action1 = 0.2 credits).
		const usageWindowsJson = await ctx.redisV2.hget(
			balanceKey,
			"_usage_windows",
		);
		expect(usageWindowsJson).toBeTruthy();
		const usageWindows = JSON.parse(usageWindowsJson as string);
		expect(Array.isArray(usageWindows)).toBe(true);
		expect(usageWindows).toHaveLength(1);
		expect(usageWindows[0].feature_id).toBe(TestFeature.Credits);
		expect(usageWindows[0].internal_entity_id).toBeNull();
		expect(typeof usageWindows[0].id).toBe("string");
		expect(Number(usageWindows[0].usage)).toBe(0.2);

		// The cus-ent blob no longer embeds windows.
		const blobJson = await ctx.redisV2.hget(balanceKey, creditsEnt.id);
		expect(blobJson).toBeTruthy();
		const blob = JSON.parse(blobJson as string);
		expect(blob.usage_windows).toBeUndefined();

		// The hash must carry a TTL (counters never outlive the cache contract).
		const ttl = await ctx.redisV2.ttl(balanceKey);
		expect(ttl).toBeGreaterThan(0);
	},
);

// Write-through: the Redis counter must reach the customer-scoped
// usage_windows table via the shared sync.
test.concurrent(
	`${chalk.yellowBright("usage-window-sync2: window counter writes through to the usage_windows table")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-sync-write",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-sync-write-1";
		const { ctx } = await initScenario({
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
			featureId: TestFeature.Credits,
			limit: 5,
			interval: ResetInterval.Day,
		});

		// 5 action1 = 1 credit; under the 5-credit/day cap. The counter is a
		// customer-scoped row on the credits feature (balance dimension).
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});

		const customerRow = queryRows(
			await ctx.db.execute(sql`
				SELECT internal_id FROM customers
				WHERE id = ${customerId} AND org_id = ${ctx.org.id} AND env = ${ctx.env}
				LIMIT 1
			`),
		)[0];
		expect(customerRow?.internal_id).toBeTruthy();

		const creditsEnt = queryRows(
			await ctx.db.execute(sql`
				SELECT id, internal_feature_id FROM customer_entitlements
				WHERE customer_id = ${customerId} AND feature_id = ${TestFeature.Credits}
				LIMIT 1
			`),
		)[0];
		expect(creditsEnt?.id).toBeTruthy();

		// Build the typed update from the live counter field (production hands
		// this down from the Lua result), then drive the write-through.
		const usageWindowsJson = await ctx.redisV2.hget(
			buildSharedFullSubjectBalanceKey({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				featureId: TestFeature.Credits,
			}),
			"_usage_windows",
		);
		expect(usageWindowsJson).toBeTruthy();

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
				usageWindowUpdates: [
					{
						internal_customer_id: customerRow.internal_id,
						feature_id: TestFeature.Credits,
						usage_windows: JSON.parse(usageWindowsJson as string),
					},
				],
			},
		});

		const windowRows = queryRows(
			await ctx.db.execute(sql`
				SELECT feature_id, internal_feature_id, internal_entity_id,
					anchor_customer_entitlement_id, usage
				FROM usage_windows
				WHERE internal_customer_id = ${customerRow.internal_id}
					AND feature_id = ${TestFeature.Credits}
			`),
		);
		expect(windowRows).toHaveLength(1);
		expect(windowRows[0].feature_id).toBe(TestFeature.Credits);
		expect(windowRows[0].internal_feature_id).toBe(
			creditsEnt.internal_feature_id,
		);
		// Customer scope (no entity) with bounds provenance from the credits ent.
		expect(windowRows[0].internal_entity_id).toBeNull();
		expect(windowRows[0].anchor_customer_entitlement_id).toBe(creditsEnt.id);
		expect(Number(windowRows[0].usage)).toBe(1);
	},
);

/**
 * Race-safety contract of the PG mirror (sync_balances_v2 STEP 4):
 *   - CREATE: syncing a snapshot for a scope with no existing row inserts it
 *     with the snapshot's id.
 *   - CONCURRENT CREATE: two parallel syncs for the same scope key
 *     (internal_customer_id, feature_id, entity-nullsafe) with DIFFERENT
 *     candidate ids both succeed -- no unique-violation abort -- and exactly
 *     one row exists, id = one of the candidates.
 *   - LAST-WRITE-WINS: the row's usage ends at the snapshot with the highest
 *     updated_at; a stale snapshot synced later never clobbers a newer value.
 *   - ID STABILITY: a newer snapshot with a different id updates the row but
 *     never changes the stored id (DO UPDATE excludes id).
 *   - ROLL FORWARD: a snapshot with advanced bounds moves the SAME row's
 *     window_start_at/window_end_at in place (one mutable row per scope).
 */
test.concurrent(
	`${chalk.yellowBright("usage-window-sync3: PG mirror upserts on the scope key, race-safe on create")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-sync-upsert",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-sync-upsert-1";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		const customerRow = queryRows(
			await ctx.db.execute(sql`
				SELECT internal_id FROM customers
				WHERE id = ${customerId} AND org_id = ${ctx.org.id} AND env = ${ctx.env}
				LIMIT 1
			`),
		)[0];
		expect(customerRow?.internal_id).toBeTruthy();
		const internalCustomerId = customerRow.internal_id as string;

		const messagesFeature = ctx.features.find(
			(feature) => feature.id === TestFeature.Messages,
		);
		expect(messagesFeature?.internal_id).toBeTruthy();

		const now = Date.now();
		const activeWindowStart = now - HOUR_MS;
		const activeWindowEnd = now + HOUR_MS;

		const buildWindowRow = ({
			id,
			usage,
			updatedAt,
			windowStartAt = activeWindowStart,
			windowEndAt = activeWindowEnd,
		}: {
			id: string;
			usage: number;
			updatedAt: number;
			windowStartAt?: number;
			windowEndAt?: number;
		}) => ({
			id,
			internal_customer_id: internalCustomerId,
			internal_entity_id: null,
			feature_id: TestFeature.Messages,
			internal_feature_id: messagesFeature?.internal_id as string,
			anchor_customer_entitlement_id: null,
			window_start_at: windowStartAt,
			window_end_at: windowEndAt,
			usage,
			updated_at: updatedAt,
		});

		const syncSnapshot = (usageWindows: UsageWindowUpdate["usage_windows"]) =>
			syncItemV4({
				ctx,
				payload: {
					customerId,
					orgId: ctx.org.id,
					env: ctx.env,
					timestamp: Date.now(),
					modifiedCusEntIdsByFeatureId: {},
					usageWindowUpdates: [
						{
							internal_customer_id: internalCustomerId,
							feature_id: TestFeature.Messages,
							usage_windows: usageWindows,
						},
					],
				},
			});

		const fetchWindowRows = async () =>
			queryRows(
				await ctx.db.execute(sql`
					SELECT id, window_start_at, window_end_at, usage, updated_at
					FROM usage_windows
					WHERE internal_customer_id = ${internalCustomerId}
						AND feature_id = ${TestFeature.Messages}
					ORDER BY window_start_at ASC
				`),
			);

		// ── CONCURRENT CREATE ────────────────────────────────────────────────
		// Two parallel syncs race to create the same logical window with
		// different candidate ids: no unique-violation abort; one row, id from
		// whichever inserted first.
		const candidateA = buildWindowRow({
			id: "uw_test_a",
			usage: 5,
			updatedAt: now - 2000,
		});
		const candidateB = buildWindowRow({
			id: "uw_test_b",
			usage: 7,
			updatedAt: now - 1000,
		});

		await Promise.all([syncSnapshot([candidateA]), syncSnapshot([candidateB])]);

		let windowRows = await fetchWindowRows();
		expect(windowRows).toHaveLength(1);
		expect(["uw_test_a", "uw_test_b"]).toContain(windowRows[0].id);
		const createdId = windowRows[0].id as string;

		// ── LAST-WRITE-WINS across orderings ─────────────────────────────────
		// Whichever commit order the race produced, the surviving usage must be
		// the snapshot with the HIGHEST updated_at (candidateB: 7).
		expect(Number(windowRows[0].usage)).toBe(7);

		// A stale snapshot (older updated_at) synced afterwards must not clobber.
		await syncSnapshot([
			buildWindowRow({ id: "uw_test_stale", usage: 6, updatedAt: now - 5000 }),
		]);
		windowRows = await fetchWindowRows();
		expect(windowRows).toHaveLength(1);
		expect(Number(windowRows[0].usage)).toBe(7);

		// ── ID STABILITY ─────────────────────────────────────────────────────
		// A newer snapshot carrying a DIFFERENT candidate id (e.g. a fail-open
		// counter restart minted a fresh ksuid) updates usage on the logical key
		// but never replaces the stored id.
		await syncSnapshot([
			buildWindowRow({ id: "uw_test_c", usage: 9, updatedAt: now }),
		]);
		windowRows = await fetchWindowRows();
		expect(windowRows).toHaveLength(1);
		expect(Number(windowRows[0].usage)).toBe(9);
		expect(windowRows[0].id).toBe(createdId);

		// ── ROLL FORWARD ─────────────────────────────────────────────────────
		// A newer snapshot with ADVANCED bounds moves the same row in place:
		// still exactly one row per scope, same id, new window.
		const rolledStart = now + HOUR_MS;
		const rolledEnd = now + 2 * HOUR_MS;
		await syncSnapshot([
			buildWindowRow({
				id: "uw_test_rolled",
				usage: 0,
				updatedAt: now + 1000,
				windowStartAt: rolledStart,
				windowEndAt: rolledEnd,
			}),
		]);
		windowRows = await fetchWindowRows();
		expect(windowRows).toHaveLength(1);
		expect(windowRows[0].id).toBe(createdId);
		expect(Number(windowRows[0].usage)).toBe(0);
		expect(Number(windowRows[0].window_start_at)).toBe(rolledStart);
		expect(Number(windowRows[0].window_end_at)).toBe(rolledEnd);
	},
);
