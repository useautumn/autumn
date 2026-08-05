import { expect, test } from "bun:test";
import { type ApiCustomerV3, applyProration, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";

/**
 * create_schedule phase boundaries: what happens when the test clock crosses
 * into the next phase — plan membership and the transition invoice.
 */

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

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
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

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			active: [premium.id],
			notPresent: [pro.id],
		});
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 2,
			latestTotal: expectedProration,
		});

		const customerAfterTransition =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
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

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			active: [premium.id],
			notPresent: [pro.id],
		});
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 3,
			latestTotal: 50,
		});
	},
);
