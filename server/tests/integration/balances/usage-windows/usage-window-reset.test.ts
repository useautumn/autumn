import { expect, test } from "bun:test";
import { type ApiCustomerV5, ApiVersion } from "@autumn/shared";
import { expectUsageLimitCorrect } from "@tests/integration/utils/expectUsageLimitCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { setCustomerUsageLimit } from "../utils/usage-limit-utils/customerUsageLimitUtils.js";
import { expireUsageWindowForReset } from "../utils/usage-limit-utils/expireUsageWindowForReset.js";
import { fetchActivePlanCusEnt } from "../utils/usage-limit-utils/usageWindowDbTestUtils.js";

// Usage-window LAZY ROLL, per read path (mirrors reset/get-customer-reset):
// once a counter's stored window closes, ANY subject read -- DB (skip_cache),
// cached, or entity-scoped -- must report usage 0 and ROLL the row in place
// (usage zeroed, bounds advanced to the current derivation) in PG + cache.

// initScenario only exposes clients up to V2_2; build the latest-version client
// directly (same pattern as the v2.2-vs-v2.3 parity tests).
const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
const queryRows = (result: unknown): any[] =>
	// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
	Array.isArray(result) ? result : ((result as { rows?: any[] })?.rows ?? []);

const HOUR_MS = 60 * 60 * 1000;

const fetchWindowRows = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: TestContext;
	customerId: string;
	featureId: string;
}) =>
	queryRows(
		await ctx.db.execute(sql`
			SELECT id, window_end_at, usage FROM usage_windows
			WHERE feature_id = ${featureId}
				AND internal_customer_id = (
					SELECT internal_id FROM customers
					WHERE id = ${customerId} AND org_id = ${ctx.org.id} AND env = ${ctx.env}
					LIMIT 1
				)
		`),
	);

// ─────────────────────────────────────────────────────────────────
// GET /customers (skip_cache) — DB path lazy reset
// ─────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("usage-window-reset1 (DB): skip_cache GET prunes an expired window")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-reset-db",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-reset-db-1";
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
			value: 3,
		});

		// Flush the counter to Postgres, then close its window in both stores.
		await timeout(4000);
		expect(
			await fetchWindowRows({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			}),
		).toHaveLength(1);
		await expireUsageWindowForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		// DB-path read: reports a fresh window and prunes the expired row.
		const fromDb = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expectUsageLimitCorrect({
			customer: fromDb,
			featureId: TestFeature.Messages,
			usage: 0,
			limit: 5,
		});

		// The row PERSISTS, rolled in place: usage zeroed, bounds advanced to the
		// current derivation (the messages ent's cycle).
		const messagesEnt = await fetchActivePlanCusEnt({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		const rolledRows = await fetchWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(rolledRows).toHaveLength(1);
		expect(Number(rolledRows[0].usage)).toBe(0);
		expect(Number(rolledRows[0].window_end_at)).toBe(
			Number(messagesEnt.next_reset_at),
		);

		// The cache field is rolled too (the DB-path roll patches both stores).
		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId: TestFeature.Messages,
		});
		const rolledJson = await ctx.redisV2.hget(balanceKey, "_usage_windows");
		expect(rolledJson).toBeTruthy();
		const rolledCache = JSON.parse(rolledJson as string);
		expect(rolledCache).toHaveLength(1);
		expect(Number(rolledCache[0].usage)).toBe(0);
	},
);

// ─────────────────────────────────────────────────────────────────
// GET /customers (cached) — cache path lazy reset
// ─────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("usage-window-reset2 (cache): cached GET prunes an expired window")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-reset-cache",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-reset-cache-1";
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
			value: 3,
		});

		// Warm the cache with the live counter visible.
		const warm = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectUsageLimitCorrect({
			customer: warm,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
		});

		// Flush to Postgres, then close the window in both stores.
		await timeout(4000);
		await expireUsageWindowForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		// Cache-path read: reports a fresh window and prunes the expired row.
		const cached = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectUsageLimitCorrect({
			customer: cached,
			featureId: TestFeature.Messages,
			usage: 0,
			limit: 5,
		});

		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId: TestFeature.Messages,
		});
		const rolledJson = await ctx.redisV2.hget(balanceKey, "_usage_windows");
		expect(rolledJson).toBeTruthy();
		const rolledCache = JSON.parse(rolledJson as string);
		expect(rolledCache).toHaveLength(1);
		expect(Number(rolledCache[0].usage)).toBe(0);

		const rolledRows = await fetchWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(rolledRows).toHaveLength(1);
		expect(Number(rolledRows[0].usage)).toBe(0);
	},
);

// ─────────────────────────────────────────────────────────────────
// GET /entities — entity-subject path lazy reset
// ─────────────────────────────────────────────────────────────────

// Entity-scoped usage limits aren't writable in v1, but the roll machinery
// must already handle entity-scoped counter rows (seeded here directly) so the
// future entity path inherits a working lazy roll. The customer-scoped live
// counter must survive the entity-scoped zeroing.
test.concurrent(
	`${chalk.yellowBright("usage-window-reset3 (entity): an entity read zeroes its expired window, customer counter untouched")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-reset-entity",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyUsers({ includedUsage: 5 }),
			],
		});

		const customerId = "uw-reset-entity-1";
		const { ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		// Live CUSTOMER-scoped counter in the current window; flush it to
		// Postgres so the end-state assertion can see it.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
		});
		await timeout(4000);

		const customerRow = queryRows(
			await ctx.db.execute(sql`
				SELECT internal_id FROM customers
				WHERE id = ${customerId} AND org_id = ${ctx.org.id} AND env = ${ctx.env}
				LIMIT 1
			`),
		)[0];
		expect(customerRow?.internal_id).toBeTruthy();
		const entityRow = queryRows(
			await ctx.db.execute(sql`
				SELECT internal_id FROM entities
				WHERE internal_customer_id = ${customerRow.internal_id}
					AND id = ${entities[0].id}
				LIMIT 1
			`),
		)[0];
		expect(entityRow?.internal_id).toBeTruthy();
		const messagesEnt = queryRows(
			await ctx.db.execute(sql`
				SELECT internal_feature_id FROM customer_entitlements
				WHERE customer_id = ${customerId} AND feature_id = ${TestFeature.Messages}
				LIMIT 1
			`),
		)[0];
		expect(messagesEnt?.internal_feature_id).toBeTruthy();

		// Seed a CLOSED, ENTITY-scoped window row into both stores.
		const now = Date.now();
		const closedEntityWindow = {
			id: "uw_test_entity_closed",
			internal_customer_id: customerRow.internal_id,
			internal_entity_id: entityRow.internal_id,
			feature_id: TestFeature.Messages,
			internal_feature_id: messagesEnt.internal_feature_id,
			anchor_customer_entitlement_id: null,
			window_start_at: now - 3 * HOUR_MS,
			window_end_at: now - HOUR_MS,
			usage: 4,
			updated_at: now,
		};
		await ctx.db.execute(sql`
			INSERT INTO usage_windows (
				id, internal_customer_id, internal_entity_id, feature_id,
				internal_feature_id, anchor_customer_entitlement_id,
				window_start_at, window_end_at, usage, updated_at
			) VALUES (
				${closedEntityWindow.id}, ${closedEntityWindow.internal_customer_id},
				${closedEntityWindow.internal_entity_id}, ${closedEntityWindow.feature_id},
				${closedEntityWindow.internal_feature_id}, NULL,
				${closedEntityWindow.window_start_at}, ${closedEntityWindow.window_end_at},
				${closedEntityWindow.usage}, ${closedEntityWindow.updated_at}
			)
		`);
		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId: TestFeature.Messages,
		});
		const liveJson = await ctx.redisV2.hget(balanceKey, "_usage_windows");
		expect(liveJson).toBeTruthy();
		await ctx.redisV2.hset(
			balanceKey,
			"_usage_windows",
			JSON.stringify([...JSON.parse(liveJson as string), closedEntityWindow]),
		);

		// An ENTITY read runs the lazy reset on the entity subject, which carries
		// the entity-scoped rows.
		await autumnV2_3.entities.get(customerId, entities[0].id);

		// The expired entity row persists, ZEROED in place...
		const entityRows = queryRows(
			await ctx.db.execute(sql`
				SELECT id, usage FROM usage_windows WHERE id = ${closedEntityWindow.id}
			`),
		);
		expect(entityRows).toHaveLength(1);
		expect(Number(entityRows[0].usage)).toBe(0);

		// ...and in the cache field, while the live customer-scoped counter
		// survives untouched.
		const rolledJson = await ctx.redisV2.hget(balanceKey, "_usage_windows");
		expect(rolledJson).toBeTruthy();
		const rolledWindows = JSON.parse(rolledJson as string) as {
			internal_entity_id: string | null;
			usage: number;
		}[];
		expect(rolledWindows).toHaveLength(2);
		const customerRowCached = rolledWindows.find(
			(w) => w.internal_entity_id == null,
		);
		const entityRowCached = rolledWindows.find(
			(w) => w.internal_entity_id != null,
		);
		expect(Number(customerRowCached?.usage)).toBe(2);
		expect(Number(entityRowCached?.usage)).toBe(0);

		const allRows = await fetchWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(allRows).toHaveLength(2);
	},
);
