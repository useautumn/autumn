import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	type AttachParamsV0Input,
	type AttachParamsV1Input,
	BillingInterval,
	type CreatePlanParamsV2Input,
	customers,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { completeInvoiceCheckoutV2 } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

const USD_AMOUNT = 150;
const CNY_AMOUNT = 1000;

const createCnyPlan = async () => {
	const planId = `mc_lock_${getSuffix()}`;
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "MC Currency Lock Plan",
		auto_enable: false,
		price: {
			amount: USD_AMOUNT,
			interval: BillingInterval.Month,
			additional_currencies: [{ currency: "cny", amount: CNY_AMOUNT }],
		},
	});
	return planId;
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
	`${chalk.yellowBright("mc currency lock 1: direct attach with currency=cny locks customers.currency (latest api)")}`,
	async () => {
		const planId = await createCnyPlan();

		const { customerId, autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId: "mc-lock-direct-latest",
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBeNull();

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: planId,
			currency: "cny",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: planId });
		expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: CNY_AMOUNT,
		});

		const subs = await ctx.stripeCli.subscriptions.list({
			customer: customer.stripe_id as string,
		});
		expect(subs.data).toHaveLength(1);
		expect(subs.data[0].currency).toBe("cny");

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBe("cny");
	},
);

test.concurrent(
	`${chalk.yellowBright("mc currency lock 2: direct attach with currency=cny locks customers.currency (x-api-version 1.2)")}`,
	async () => {
		const planId = await createCnyPlan();

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-lock-direct-v1-2",
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBeNull();

		await autumnV1.billing.attach<AttachParamsV0Input>({
			customer_id: customerId,
			product_id: planId,
			currency: "cny",
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: planId });
		expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: CNY_AMOUNT,
		});

		const subs = await ctx.stripeCli.subscriptions.list({
			customer: customer.stripe_id as string,
		});
		expect(subs.data).toHaveLength(1);
		expect(subs.data[0].currency).toBe("cny");

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBe("cny");
	},
);

test.concurrent(
	`${chalk.yellowBright("mc currency lock 3: attach with no currency param locks to org default (usd)")}`,
	async () => {
		const planId = await createCnyPlan();

		const { customerId, autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId: "mc-lock-default-usd",
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBeNull();

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: planId,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: planId });
		expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: USD_AMOUNT,
		});

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBe("usd");
	},
);

test.concurrent(
	`${chalk.yellowBright("mc currency lock 4a: invoice-mode attach (immediate) with currency=cny locks customers.currency")}`,
	async () => {
		const planId = await createCnyPlan();

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-lock-invoice-imm",
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBeNull();

		await autumnV1.billing.attach<AttachParamsV0Input>({
			customer_id: customerId,
			product_id: planId,
			currency: "cny",
			invoice: true,
			finalize_invoice: true,
			enable_product_immediately: true,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: planId });
		expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: CNY_AMOUNT,
		});

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBe("cny");
	},
);

test.concurrent(
	`${chalk.yellowBright("mc currency lock 4b: deferred invoice attach with currency=cny locks after invoice paid")}`,
	async () => {
		const planId = await createCnyPlan();

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-lock-invoice-def",
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBeNull();

		const result = await autumnV1.billing.attach<AttachParamsV0Input>({
			customer_id: customerId,
			product_id: planId,
			currency: "cny",
			invoice: true,
			finalize_invoice: true,
			enable_product_immediately: false,
		});
		expect(result.invoice?.status).toBe("open");
		expect(result.payment_url).toBeDefined();

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBeNull();

		await completeInvoiceCheckoutV2({ url: result.payment_url as string });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: planId });
		expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: CNY_AMOUNT,
			latestStatus: "paid",
		});

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBe("cny");
	},
);

test.concurrent(
	`${chalk.yellowBright("mc currency lock 5: stripe-checkout attach with currency=cny locks after checkout completes")}`,
	async () => {
		const planId = await createCnyPlan();

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-lock-checkout",
			setup: [s.customer({})],
			actions: [],
		});

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBeNull();

		const result = await autumnV1.billing.attach<AttachParamsV0Input>({
			customer_id: customerId,
			product_id: planId,
			currency: "cny",
		});
		expect(result.payment_url).toBeDefined();
		expect(result.payment_url).toContain("checkout.stripe.com");

		await completeStripeCheckoutFormV2({ url: result.payment_url as string });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: planId });
		expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: CNY_AMOUNT,
		});

		expect(await getDbCustomerCurrency({ ctx, customerId })).toBe("cny");
	},
);
