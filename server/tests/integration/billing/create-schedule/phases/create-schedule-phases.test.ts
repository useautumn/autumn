import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	applyProration,
	type CreateScheduleParamsV0Input,
	CusProductStatus,
	customerProducts,
	ms,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import {
	getCustomerProductRows,
	getRequiredScheduleId,
} from "../utils/createScheduleTestHelpers";

const latestStripeInvoice = async ({
	ctx,
	customer,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customer: ApiCustomerV3;
}) => {
	const stripeId = customer.invoices?.[0]?.stripe_id;
	if (!stripeId) throw new Error("Expected latest invoice to have stripe_id");

	return await ctx.stripeCli.invoices.retrieve(stripeId, {
		expand: ["lines.data.price"],
	});
};

const pendingStripeInvoiceItems = async ({
	ctx,
	customer,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customer: ApiCustomerV3;
}) => {
	if (!customer.stripe_id)
		throw new Error("Expected customer to have stripe_id");

	return await ctx.stripeCli.invoiceItems.list({
		customer: customer.stripe_id,
		pending: true,
		limit: 100,
	});
};

const stripeInvoicesForCustomer = async ({
	ctx,
	customer,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customer: ApiCustomerV3;
}) => {
	if (!customer.stripe_id)
		throw new Error("Expected customer to have stripe_id");

	const invoices = await ctx.stripeCli.invoices.list({
		customer: customer.stripe_id,
		limit: 100,
	});

	return await Promise.all(
		invoices.data.map((invoice) =>
			ctx.stripeCli.invoices.retrieve(invoice.id!, {
				expand: ["lines.data.price"],
			}),
		),
	);
};

const lineAmountDollars = (line: Stripe.InvoiceLineItem) =>
	new Decimal(line.amount).div(100);

const invoiceLineTotal = (invoice: Stripe.Invoice) =>
	invoice.lines.data.reduce(
		(total, line) => total.plus(lineAmountDollars(line)),
		new Decimal(0),
	);

const initialMonthlyPeriod = (invoice: Stripe.Invoice) => {
	const monthlyLine = invoice.lines.data.find((line) => line.amount > 0);
	if (!monthlyLine) throw new Error("Expected a positive monthly invoice line");

	return {
		start: monthlyLine.period.start * 1000,
		end: monthlyLine.period.end * 1000,
	};
};

const expectedMonthlyProrationDiff = ({
	oldAmount,
	newAmount,
	transitionAt,
	billingPeriod,
}: {
	oldAmount: number;
	newAmount: number;
	transitionAt: number;
	billingPeriod: { start: number; end: number };
}) =>
	// Each invoice line is rounded to cents independently, so round each
	// prorated leg before differencing (matches atmnToStripeAmount).
	new Decimal(
		applyProration({
			now: transitionAt,
			billingPeriod,
			amount: newAmount,
		}),
	)
		.toDecimalPlaces(2)
		.minus(
			new Decimal(
				applyProration({
					now: transitionAt,
					billingPeriod,
					amount: oldAmount,
				}),
			).toDecimalPlaces(2),
		)
		.toNumber();

const expectStripeInvoiceWithTotal = ({
	invoices,
	total,
}: {
	invoices: Stripe.Invoice[];
	total: number;
}) => {
	const invoice = invoices.find((candidate) => {
		const candidateTotal = new Decimal(candidate.total).div(100);
		return candidateTotal.minus(total).abs().lte(0.01);
	});

	expect(invoice, `Expected Stripe invoice total $${total}`).toBeDefined();
	return invoice!;
};

test.concurrent(
	`${chalk.yellowBright("create-schedule: bills the first phase immediately and stores later phases as scheduled")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "create-schedule-basic",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [],
		});

		const now = Date.now();
		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: pro.id }],
				},
				{
					starts_at: now,
					plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
				},
			],
		};

		const response = await autumnV1.billing.createSchedule(params);
		const scheduleId = getRequiredScheduleId(response.schedule_id);

		expect(response.customer_id).toBe(customerId);
		expect(response.entity_id).toBeNull();
		expect(response.status).toBe("created");
		expect(response.payment_url).toBeNull();
		expect(response.invoice?.total).toBe(40);
		expect(response.phases).toHaveLength(2);
		expect(response.phases[0]!.starts_at).toBe(now);
		expect(response.phases[0]!.customer_product_ids).toHaveLength(2);
		expect(response.phases[1]!.starts_at).toBe(now + ms.days(30));
		expect(response.phases[1]!.customer_product_ids).toHaveLength(1);

		const dbSchedule = await ctx.db
			.select()
			.from(schedules)
			.where(eq(schedules.id, scheduleId));
		expect(dbSchedule).toHaveLength(1);

		const dbPhases = await ctx.db
			.select()
			.from(schedulePhases)
			.where(eq(schedulePhases.schedule_id, scheduleId));
		expect(dbPhases).toHaveLength(2);

		const immediatePhaseCustomerProducts = await ctx.db
			.select()
			.from(customerProducts)
			.where(
				inArray(customerProducts.id, response.phases[0]!.customer_product_ids),
			);
		const phase1CustomerProducts = await ctx.db
			.select()
			.from(customerProducts)
			.where(
				inArray(customerProducts.id, response.phases[1]!.customer_product_ids),
			);

		expect(immediatePhaseCustomerProducts).toHaveLength(2);
		expect(
			immediatePhaseCustomerProducts.every(
				(customerProduct) => customerProduct.status === CusProductStatus.Active,
			),
		).toBe(true);
		expect(phase1CustomerProducts).toHaveLength(1);
		expect(
			phase1CustomerProducts.every(
				(customerProduct) =>
					customerProduct.status === CusProductStatus.Scheduled,
			),
		).toBe(true);
		expect(
			immediatePhaseCustomerProducts.filter(
				(customerProduct) => customerProduct.product_id === pro.id,
			),
		).toHaveLength(1);
		expect(
			immediatePhaseCustomerProducts.filter(
				(customerProduct) => customerProduct.product_id === addon.id,
			),
		).toHaveLength(1);
		expect(phase1CustomerProducts[0]!.product_id).toBe(pro.id);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 40,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: later-phase-only plans stay scheduled and never hit immediate billing")}`,
	async () => {
		const nowBase = products.pro({
			id: "create-schedule-now-base",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const nowAddon = products.recurringAddOn({
			id: "create-schedule-now-addon",
			items: [items.monthlyWords({ includedUsage: 50 })],
		});
		const futureGroupB = products.base({
			id: "create-schedule-future-group-b",
			items: [items.monthlyUsers({ includedUsage: 5 }), items.monthlyPrice()],
			group: "group-b",
		});
		const futureGroupC = products.base({
			id: "create-schedule-future-group-c",
			items: [
				items.monthlyMessages({ includedUsage: 250 }),
				items.monthlyPrice(),
			],
			group: "group-c",
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "create-schedule-future-only-not-now",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({
					list: [nowBase, nowAddon, futureGroupB, futureGroupC],
				}),
			],
			actions: [],
		});

		const now = Date.now();
		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: nowBase.id }, { plan_id: nowAddon.id }],
				},
				{
					starts_at: now + ms.days(15),
					plans: [{ plan_id: futureGroupB.id }],
				},
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: futureGroupC.id }],
				},
			],
		});

		const productRows = await getCustomerProductRows({
			ctx,
			customerId,
			productIds: [nowBase.id, nowAddon.id, futureGroupB.id, futureGroupC.id],
		});
		const activeRows = productRows
			.filter((productRow) => productRow.status === CusProductStatus.Active)
			.sort((a, b) => a.productId!.localeCompare(b.productId!));
		const scheduledRows = productRows
			.filter((productRow) => productRow.status === CusProductStatus.Scheduled)
			.sort((a, b) => a.productId!.localeCompare(b.productId!));

		expect(activeRows).toEqual(
			[
				{ productId: nowBase.id, status: CusProductStatus.Active },
				{ productId: nowAddon.id, status: CusProductStatus.Active },
			].sort((a, b) => a.productId.localeCompare(b.productId)),
		);
		expect(scheduledRows).toEqual(
			[
				{ productId: futureGroupB.id, status: CusProductStatus.Scheduled },
				{ productId: futureGroupC.id, status: CusProductStatus.Scheduled },
			].sort((a, b) => a.productId.localeCompare(b.productId)),
		);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestInvoiceProductIds: [nowBase.id, nowAddon.id],
		});
		expect(customer.invoices?.[0]?.product_ids).not.toContain(futureGroupB.id);
		expect(customer.invoices?.[0]?.product_ids).not.toContain(futureGroupC.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: now phase stays the exact active set across groups and future phases")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const usersItem = items.monthlyUsers({ includedUsage: 5 });
		const wordsItem = items.monthlyWords({ includedUsage: 25 });

		const currentA = products.base({
			id: "create-schedule-exact-current-a",
			items: [messagesItem, items.monthlyPrice({ price: 5 })],
		});
		const keepNowB = products.base({
			id: "create-schedule-exact-keep-b",
			items: [usersItem, items.monthlyPrice({ price: 5 })],
			group: "group-b",
		});
		const currentAddon = products.recurringAddOn({
			id: "create-schedule-exact-current-addon",
			items: [wordsItem],
		});
		const nowReplacementA = products.pro({
			id: "create-schedule-exact-now-a",
			items: [messagesItem],
		});
		const futureReplacementB = products.base({
			id: "create-schedule-exact-future-b",
			items: [usersItem, items.monthlyPrice({ price: 15 })],
			group: "group-b",
		});
		const futureAddon = products.recurringAddOn({
			id: "create-schedule-exact-future-addon",
			items: [wordsItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "create-schedule-exact-now-set",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({
					list: [
						currentA,
						keepNowB,
						currentAddon,
						nowReplacementA,
						futureReplacementB,
						futureAddon,
					],
				}),
			],
			actions: [
				s.billing.attach({ productId: currentA.id }),
				s.billing.attach({ productId: keepNowB.id }),
				s.billing.attach({ productId: currentAddon.id }),
			],
		});

		const now = Date.now();
		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: nowReplacementA.id }, { plan_id: keepNowB.id }],
				},
				{
					starts_at: now + ms.days(15),
					plans: [
						{ plan_id: futureReplacementB.id },
						{ plan_id: futureAddon.id },
					],
				},
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: currentA.id }],
				},
			],
		});

		const productRows = await getCustomerProductRows({
			ctx,
			customerId,
			productIds: [
				currentA.id,
				keepNowB.id,
				currentAddon.id,
				nowReplacementA.id,
				futureReplacementB.id,
				futureAddon.id,
			],
		});
		const activeRows = productRows
			.filter((productRow) => productRow.status === CusProductStatus.Active)
			.sort((a, b) => a.productId!.localeCompare(b.productId!));
		const scheduledRows = productRows
			.filter((productRow) => productRow.status === CusProductStatus.Scheduled)
			.sort((a, b) => a.productId!.localeCompare(b.productId!));

		expect(activeRows).toEqual(
			[
				{ productId: keepNowB.id, status: CusProductStatus.Active },
				{ productId: nowReplacementA.id, status: CusProductStatus.Active },
			].sort((a, b) => a.productId.localeCompare(b.productId)),
		);
		expect(scheduledRows).toEqual(
			[
				{ productId: currentA.id, status: CusProductStatus.Scheduled },
				{ productId: futureAddon.id, status: CusProductStatus.Scheduled },
				{
					productId: futureReplacementB.id,
					status: CusProductStatus.Scheduled,
				},
			].sort((a, b) => a.productId.localeCompare(b.productId)),
		);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.invoices?.[0]?.product_ids).not.toContain(
			futureReplacementB.id,
		);
		expect(customer.invoices?.[0]?.product_ids).not.toContain(futureAddon.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: plans omitted from the next phase end at the phase boundary")}`,
	async () => {
		const nowBase = products.pro({
			id: "create-schedule-phase-end-now-base",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const nowAddon = products.recurringAddOn({
			id: "create-schedule-phase-end-now-addon",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});
		const nextBase = products.premium({
			id: "create-schedule-phase-end-next-base",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const nextAddon = products.recurringAddOn({
			id: "create-schedule-phase-end-next-addon",
			items: [items.monthlyWords({ includedUsage: 75 })],
		});

		const { customerId, autumnV1, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId: "create-schedule-phase-end-boundary",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [nowBase, nowAddon, nextBase, nextAddon] }),
				],
				actions: [],
			});

		const now = advancedTo;
		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: nowBase.id }, { plan_id: nowAddon.id }],
				},
				{
					starts_at: now + ms.days(15),
					plans: [{ plan_id: nextBase.id }, { plan_id: nextAddon.id }],
				},
			],
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: now + ms.days(16),
			waitForSeconds: 30,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [nextAddon.id, nextBase.id],
			notPresent: [nowAddon.id, nowBase.id],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: phase transition invoices monthly upgrade proration immediately")}`,
	async () => {
		const pro = products.pro({
			id: "create-schedule-transition-invoice-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "create-schedule-transition-invoice-premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV1, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId: "create-schedule-transition-invoice",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
				],
				actions: [],
			});

		const now = advancedTo;
		const transitionAt = now + ms.days(15);
		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: pro.id }],
				},
				{
					starts_at: transitionAt,
					plans: [{ plan_id: premium.id }],
				},
			],
		});

		const initialCustomer =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: initialCustomer,
			count: 1,
			latestTotal: 20,
		});

		const initialInvoice = await latestStripeInvoice({
			ctx,
			customer: initialCustomer,
		});
		const billingPeriod = initialMonthlyPeriod(initialInvoice);
		const expectedProration = expectedMonthlyProrationDiff({
			oldAmount: 20,
			newAmount: 50,
			transitionAt,
			billingPeriod,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: transitionAt,
			waitForSeconds: 30,
		});

		const customerAfterTransition =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterTransition,
			active: [premium.id],
			notPresent: [pro.id],
		});
		await expectCustomerInvoiceCorrect({
			customer: customerAfterTransition,
			count: 2,
			latestTotal: expectedProration,
		});
		const stripeInvoices = await stripeInvoicesForCustomer({
			ctx,
			customer: customerAfterTransition,
		});
		const transitionInvoice = expectStripeInvoiceWithTotal({
			invoices: stripeInvoices,
			total: expectedProration,
		});
		expect(
			invoiceLineTotal(transitionInvoice).toDecimalPlaces(2).toNumber(),
		).toBe(expectedProration);

		const pendingItems = await pendingStripeInvoiceItems({
			ctx,
			customer: customerAfterTransition,
		});
		expect(pendingItems.data).toHaveLength(0);

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: billingPeriod.end,
			waitForSeconds: 30,
		});

		const customerAfterRenewal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterRenewal,
			active: [premium.id],
			notPresent: [pro.id],
		});
		await expectCustomerInvoiceCorrect({
			customer: customerAfterRenewal,
			count: 3,
			latestTotal: 50,
		});
	},
);
