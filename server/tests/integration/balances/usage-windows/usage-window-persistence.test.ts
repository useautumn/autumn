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
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
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

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
const queryRows = (result: unknown): any[] =>
	// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
	Array.isArray(result) ? result : ((result as { rows?: any[] })?.rows ?? []);

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

		await timeout(4000);

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

test.concurrent.skipIf(isBalanceWorkerRoute())(
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

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
		});

		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId: TestFeature.Messages,
		});
		await ctx.redisV2.hdel(balanceKey, "_usage_windows");

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

test.concurrent.skipIf(isBalanceWorkerRoute())(
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

		await timeout(4000);
		await expireUsageWindowForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

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
