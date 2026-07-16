import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	type CreatePlanParamsV2Input,
	customers,
	ErrCode,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

const MAIN_USD = 150;
const MAIN_CNY = 1000;
const SECOND_USD = 80;
const SECOND_CNY = 600;

const createCnyPlanPair = async () => {
	const suffix = getSuffix();
	const mainId = `mc_ma_lock_main_${suffix}`;
	const secondId = `mc_ma_lock_second_${suffix}`;
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: mainId,
		name: mainId,
		auto_enable: false,
		group: `g_a_${suffix}`,
		price: {
			amount: MAIN_USD,
			interval: BillingInterval.Month,
			additional_currencies: [{ currency: "cny", amount: MAIN_CNY }],
		},
	});
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: secondId,
		name: secondId,
		auto_enable: false,
		group: `g_b_${suffix}`,
		price: {
			amount: SECOND_USD,
			interval: BillingInterval.Month,
			additional_currencies: [{ currency: "cny", amount: SECOND_CNY }],
		},
	});
	return { mainId, secondId };
};

const getDbCustomerCurrency = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const row = await ctx.db.query.customers.findFirst({
		where: and(
			eq(customers.id, customerId),
			eq(customers.org_id, ctx.org.id),
			eq(customers.env, ctx.env),
		),
	});
	expect(row).toBeDefined();
	return row?.currency ?? null;
};

test.concurrent(
	`${chalk.yellowBright("mc multi-attach lock 1: multiAttach with currency=cny bills cny and locks customers.currency")}`,
	async () => {
		const { mainId, secondId } = await createCnyPlanPair();

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-ma-lock-cny",
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBeNull();

		await autumnV1.billing.multiAttach({
			customer_id: customerId,
			plans: [{ plan_id: mainId }, { plan_id: secondId }],
			currency: "cny",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({ customer, active: [mainId, secondId] });
		expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: MAIN_CNY + SECOND_CNY,
		});

		const subs = await ctx.stripeCli.subscriptions.list({
			customer: customer.stripe_id as string,
		});
		expect(subs.data.length).toBeGreaterThanOrEqual(1);
		for (const sub of subs.data as Stripe.Subscription[]) {
			expect(sub.currency).toBe("cny");
		}

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBe("cny");
	},
);

test.concurrent(
	`${chalk.yellowBright("mc multi-attach lock 2: multiAttach with no currency param locks to org default (usd)")}`,
	async () => {
		const { mainId, secondId } = await createCnyPlanPair();

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-ma-lock-default",
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBeNull();

		await autumnV1.billing.multiAttach({
			customer_id: customerId,
			plans: [{ plan_id: mainId }, { plan_id: secondId }],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({ customer, active: [mainId, secondId] });
		expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: MAIN_USD + SECOND_USD,
		});

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBe("usd");
	},
);

test.concurrent(
	`${chalk.yellowBright("mc multi-attach lock 3: multiAttach currency a plan does not offer is a 400 CurrencyMismatch")}`,
	async () => {
		const suffix = getSuffix();
		const usdOnlyId = `mc_ma_lock_usdonly_${suffix}`;
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: usdOnlyId,
			name: usdOnlyId,
			auto_enable: false,
			price: { amount: 25, interval: BillingInterval.Month },
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-ma-lock-mismatch",
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.CurrencyMismatch,
			func: () =>
				autumnV1.billing.multiAttach(
					{
						customer_id: customerId,
						plans: [{ plan_id: usdOnlyId }],
						currency: "cny",
					},
					{ timeout: 0 },
				),
		});

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("mc multi-attach lock 4: locked customer with conflicting requested currency is a 400")}`,
	async () => {
		const { mainId, secondId } = await createCnyPlanPair();

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-ma-lock-conflict",
			setup: [
				s.customer({ paymentMethod: "success", data: { currency: "usd" } }),
			],
			actions: [],
		});

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBe("usd");

		await expectAutumnError({
			errCode: ErrCode.CurrencyMismatch,
			func: () =>
				autumnV1.billing.multiAttach(
					{
						customer_id: customerId,
						plans: [{ plan_id: mainId }, { plan_id: secondId }],
						currency: "cny",
					},
					{ timeout: 0 },
				),
		});

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBe("usd");
	},
);

test.concurrent(
	`${chalk.yellowBright("mc multi-attach lock 5: all-free multiAttach does not lock a currency")}`,
	async () => {
		const suffix = getSuffix();
		const freeAId = `mc_ma_lock_free_a_${suffix}`;
		const freeBId = `mc_ma_lock_free_b_${suffix}`;
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: freeAId,
			name: freeAId,
			auto_enable: false,
			group: `g_a_${suffix}`,
		});
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: freeBId,
			name: freeBId,
			auto_enable: false,
			group: `g_b_${suffix}`,
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-ma-lock-free",
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		await autumnV1.billing.multiAttach({
			customer_id: customerId,
			plans: [{ plan_id: freeAId }, { plan_id: freeBId }],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({ customer, active: [freeAId, freeBId] });

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBeNull();
	},
);
