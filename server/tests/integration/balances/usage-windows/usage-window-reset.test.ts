import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiVersion,
	type CheckResponseV3,
} from "@autumn/shared";
import { expectUsageLimitCorrect } from "@tests/integration/utils/expectUsageLimitCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { createHonoApp } from "@/initHono.js";
import { flushBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer.js";
import { CHECK_DB_HYDRATION_BUDGET_MS } from "@/internal/balances/check/getCheckDataV2.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { setCustomerUsageLimit } from "../utils/usage-limit-utils/customerUsageLimitUtils.js";
import { expireUsageWindowForReset } from "../utils/usage-limit-utils/expireUsageWindowForReset.js";
import { fetchActivePlanCusEnt } from "../utils/usage-limit-utils/usageWindowDbTestUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
const queryRows = (result: unknown): any[] =>
	// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
	Array.isArray(result) ? result : ((result as { rows?: any[] })?.rows ?? []);

const HOUR_MS = 60 * 60 * 1000;

const createDeferred = () => {
	let resolve!: () => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<void>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, reject, resolve };
};

const holdUsageWindowRowLock = ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: TestContext;
	customerId: string;
	featureId: string;
}) => {
	const acquired = createDeferred();
	const release = createDeferred();
	const settled = ctx.db.transaction(async (tx) => {
		const rows = queryRows(
			await tx.execute(sql`
				SELECT uw.id
				FROM usage_windows uw
				JOIN customers c ON c.internal_id = uw.internal_customer_id
				WHERE c.id = ${customerId}
					AND c.org_id = ${ctx.org.id}
					AND c.env = ${ctx.env}
					AND uw.feature_id = ${featureId}
				FOR UPDATE OF uw
			`),
		);
		if (rows.length !== 1) {
			throw new Error(`Expected one usage window, found ${rows.length}`);
		}
		acquired.resolve();
		await release.promise;
	});
	void settled.catch(acquired.reject);

	return { acquired: acquired.promise, release: release.resolve, settled };
};

const waitForBlockedUsageWindowUpdate = async ({
	ctx,
}: {
	ctx: TestContext;
}) => {
	for (let attempt = 0; attempt < 100; attempt++) {
		const [result] = await ctx.db.execute<{ blocked: boolean }>(sql`
			SELECT EXISTS (
				SELECT 1
				FROM pg_stat_activity
				WHERE wait_event_type = 'Lock'
					AND query ILIKE '%usage_windows%'
			) AS blocked
		`);
		if (result?.blocked) return;
		await timeout(10);
	}

	throw new Error("Timed out waiting for the first usage-window update");
};

const expectCheckAvoidedHydrationTimeout = async ({
	response,
	elapsedMs,
}: {
	response: Response;
	elapsedMs: number;
}) => {
	const body = (await response.json()) as CheckResponseV3;
	expect(response.status).toBe(200);
	expect(body.allowed).toBe(true);
	expect(body.balance).not.toBeNull();
	expect(elapsedMs).toBeLessThan(CHECK_DB_HYDRATION_BUDGET_MS);
};

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

		const fromDb = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expectUsageLimitCorrect({
			customer: fromDb,
			featureId: TestFeature.Messages,
			usage: 0,
			limit: 5,
		});

		if (isBalanceWorkerRoute())
			await flushBalanceWorkerCustomer({ ctx, customerId });

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

		if (isBalanceWorkerRoute()) return;
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

test.concurrent.skipIf(isBalanceWorkerRoute())(
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

		const warm = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectUsageLimitCorrect({
			customer: warm,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
		});

		await timeout(4000);
		await expireUsageWindowForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

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

test.concurrent.skipIf(isBalanceWorkerRoute())(
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

		await autumnV2_3.entities.get(customerId, entities[0].id);

		const entityRows = queryRows(
			await ctx.db.execute(sql`
				SELECT id, usage FROM usage_windows WHERE id = ${closedEntityWindow.id}
			`),
		);
		expect(entityRows).toHaveLength(1);
		expect(Number(entityRows[0].usage)).toBe(0);

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

test.skipIf(isBalanceWorkerRoute())(
	`${chalk.yellowBright("usage-window-reset4 (contention): competing checks do not queue behind the lazy roll")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-reset-contention",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-reset-contention-1";
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
		await timeout(4000);
		await expireUsageWindowForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		const rowLock = holdUsageWindowRowLock({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		let firstCheck: Promise<Response> | undefined;

		try {
			await rowLock.acquired;
			const app = createHonoApp();
			const check = () =>
				app.fetch(
					new Request("http://localhost/v1/balances.check", {
						method: "POST",
						headers: {
							Authorization: `Bearer ${process.env.UNIT_TEST_AUTUMN_SECRET_KEY || ""}`,
							"Content-Type": "application/json",
							"x-api-version": ApiVersion.V2_3.toString(),
						},
						body: JSON.stringify({
							customer_id: customerId,
							feature_id: TestFeature.Messages,
						}),
					}),
				);

			const pendingFirstCheck = Promise.resolve(check());
			firstCheck = pendingFirstCheck;
			void pendingFirstCheck.catch(() => undefined);
			await waitForBlockedUsageWindowUpdate({ ctx });

			const startedAt = performance.now();
			const response = await check();
			await expectCheckAvoidedHydrationTimeout({
				response,
				elapsedMs: performance.now() - startedAt,
			});
		} finally {
			rowLock.release();
			await rowLock.settled;
			if (firstCheck) await firstCheck;
		}
	},
);
