/**
 * Contract: a mid-year phase swap creates the exact annual proration delta.
 * Removed monthly prepaid items must net to zero across invoice and pending items.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	applyProration,
	BillingInterval,
	BillingMethod,
	ms,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";

const annualPrepaidWords = ({ amount }: { amount: number }) => {
	const item = itemsV2.prepaidWords({
		amount,
		billingUnits: 100,
		included: 0,
	});

	return {
		...item,
		price: {
			...item.price,
			interval: BillingInterval.Year,
			billing_method: BillingMethod.Prepaid,
		},
	};
};

const monthlyPrepaidMessages = () =>
	itemsV2.prepaidMessages({
		amount: 10,
		billingUnits: 100,
		included: 0,
	});

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

const stripeSchedulesForCustomer = async ({
	ctx,
	customer,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customer: ApiCustomerV3;
}) => {
	if (!customer.stripe_id)
		throw new Error("Expected customer to have stripe_id");

	return await ctx.stripeCli.subscriptionSchedules.list({
		customer: customer.stripe_id,
		limit: 10,
	});
};

const periodDuration = (period: { start: number; end: number }) =>
	(period.end - period.start) * 1000;

const linePeriodDuration = (line: Stripe.InvoiceLineItem) =>
	periodDuration(line.period);

const recurringLinesByPeriod = ({
	invoice,
	interval,
}: {
	invoice: Stripe.Invoice;
	interval: "month" | "year";
}) =>
	invoice.lines.data.filter((line) => {
		const duration = linePeriodDuration(line);
		if (interval === "year") return duration > ms.days(300);
		return duration > ms.days(20) && duration <= ms.days(45);
	});

const lineAmountDollars = (line: Stripe.InvoiceLineItem) =>
	new Decimal(line.amount).div(100);

const invoiceItemAmountDollars = (item: Stripe.InvoiceItem) =>
	new Decimal(item.amount).div(100);

const intervalLineTotal = ({
	invoice,
	interval,
}: {
	invoice: Stripe.Invoice;
	interval: "month" | "year";
}) =>
	recurringLinesByPeriod({ invoice, interval }).reduce(
		(total, line) => total.plus(lineAmountDollars(line)),
		new Decimal(0),
	);

const pendingItemIntervalTotal = ({
	items,
	interval,
}: {
	items: Stripe.InvoiceItem[];
	interval: "month" | "year";
}) =>
	items
		.filter((item) => {
			const duration = periodDuration(item.period);
			if (interval === "year") return duration > ms.days(300);
			return duration > ms.days(20) && duration <= ms.days(45);
		})
		.reduce(
			(total, item) => total.plus(invoiceItemAmountDollars(item)),
			new Decimal(0),
		);

const annualPeriodFromInitialInvoice = ({
	invoice,
}: {
	invoice: Stripe.Invoice;
}) => {
	const annualLine = recurringLinesByPeriod({ invoice, interval: "year" }).find(
		(line) => line.amount > 0,
	);
	if (!annualLine) throw new Error("Expected a positive annual invoice line");

	return {
		start: annualLine.period.start * 1000,
		end: annualLine.period.end * 1000,
	};
};

const expectedAnnualProrationDiff = ({
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
	new Decimal(
		applyProration({
			now: transitionAt,
			billingPeriod,
			amount: newAmount,
		}),
	)
		.minus(
			applyProration({
				now: transitionAt,
				billingPeriod,
				amount: oldAmount,
			}),
		)
		.toDecimalPlaces(2)
		.toNumber();

const expectAmountCloseTo = ({
	actual,
	expected,
}: {
	actual: Decimal | number;
	expected: Decimal | number;
}) => {
	const diff = new Decimal(actual).minus(expected).abs();
	expect(
		diff.lte(0.01),
		`Expected $${new Decimal(actual).toFixed(2)} to be within $0.01 of $${new Decimal(expected).toFixed(2)}`,
	).toBe(true);
};

const expectAutumnInvoiceWithTotal = ({
	invoices,
	total,
}: {
	invoices: NonNullable<ApiCustomerV3["invoices"]>;
	total: Decimal | number;
}) => {
	const invoice = invoices.find((candidate) =>
		new Decimal(candidate.total).minus(total).abs().lte(0.01),
	);

	expect(
		invoice,
		`Expected Autumn invoice total $${new Decimal(total).toFixed(2)}`,
	).toBeDefined();
	return invoice!;
};

const expectStripeInvoiceWithIntervalTotals = ({
	invoices,
	yearTotal,
	monthTotal,
}: {
	invoices: Stripe.Invoice[];
	yearTotal: number;
	monthTotal: number;
}) => {
	const invoice = invoices.find((candidate) => {
		const candidateYearTotal = intervalLineTotal({
			invoice: candidate,
			interval: "year",
		});
		const candidateMonthTotal = intervalLineTotal({
			invoice: candidate,
			interval: "month",
		});

		return (
			candidateYearTotal.minus(yearTotal).abs().lte(0.01) &&
			candidateMonthTotal.minus(monthTotal).abs().lte(0.01)
		);
	});

	expect(
		invoice,
		`Expected Stripe invoice with yearly total $${yearTotal} and monthly total $${monthTotal}`,
	).toBeDefined();
	return invoice!;
};

test.concurrent(
	`${chalk.yellowBright("create-schedule: customized annual prepaid proration ignores removed monthly prepaid")}`,
	async () => {
		const customerId = "create-schedule-annual-prepaid-proration";
		const group = "annual-prepaid-proration";
		const phase1 = products.base({
			id: "annual-prepaid-proration-phase-1",
			group,
			items: [items.monthlyMessages({ includedUsage: 1 })],
		});
		const phase2 = products.base({
			id: "annual-prepaid-proration-phase-2",
			group,
			items: [items.monthlyWords({ includedUsage: 1 })],
		});

		const {
			customerId: id,
			autumnV1,
			ctx,
			testClockId,
			advancedTo,
		} = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [phase1, phase2] }),
			],
			actions: [],
		});

		const now = advancedTo;
		const transitionAt = addMonths(new Date(now), 1).getTime();

		await autumnV1.billing.createSchedule({
			customer_id: id,
			phases: [
				{
					starts_at: now,
					plans: [
						{
							plan_id: phase1.id,
							customize: {
								items: [
									annualPrepaidWords({ amount: 120 }),
									monthlyPrepaidMessages(),
								],
							},
							feature_quantities: [
								{ feature_id: TestFeature.Words, quantity: 100 },
								{ feature_id: TestFeature.Messages, quantity: 100 },
							],
						},
					],
				},
				{
					starts_at: transitionAt,
					plans: [
						{
							plan_id: phase2.id,
							customize: {
								items: [annualPrepaidWords({ amount: 240 })],
							},
							feature_quantities: [
								{ feature_id: TestFeature.Words, quantity: 100 },
							],
						},
					],
				},
			],
		});

		const initialCustomer = await autumnV1.customers.get<ApiCustomerV3>(id);
		await expectCustomerInvoiceCorrect({
			customer: initialCustomer,
			count: 1,
			latestTotal: 130,
		});

		const initialInvoice = await latestStripeInvoice({
			ctx,
			customer: initialCustomer,
		});
		const initialSchedules = await stripeSchedulesForCustomer({
			ctx,
			customer: initialCustomer,
		});
		expect(initialSchedules.data[0]?.phases[1]?.proration_behavior).toBe(
			"always_invoice",
		);
		expect(initialSchedules.data[0]?.billing_mode?.type).toBe("flexible");
		const annualPeriod = annualPeriodFromInitialInvoice({
			invoice: initialInvoice,
		});
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: transitionAt,
			waitForSeconds: 30,
		});

		const customerAfterTransition =
			await autumnV1.customers.get<ApiCustomerV3>(id);
		const pendingItems = await pendingStripeInvoiceItems({
			ctx,
			customer: customerAfterTransition,
		});
		const stripeInvoices = await stripeInvoicesForCustomer({
			ctx,
			customer: customerAfterTransition,
		});
		const expectedProration = expectedAnnualProrationDiff({
			oldAmount: 120,
			newAmount: 240,
			transitionAt,
			billingPeriod: annualPeriod,
		});
		expect(customerAfterTransition.invoices).toHaveLength(3);
		expectAutumnInvoiceWithTotal({
			invoices: customerAfterTransition.invoices!,
			total: 10,
		});
		expectAutumnInvoiceWithTotal({
			invoices: customerAfterTransition.invoices!,
			total: new Decimal(expectedProration).minus(10),
		});
		const prorationInvoice = expectStripeInvoiceWithIntervalTotals({
			invoices: stripeInvoices,
			yearTotal: expectedProration,
			monthTotal: -10,
		});
		expectAmountCloseTo({
			actual: intervalLineTotal({
				invoice: prorationInvoice,
				interval: "year",
			}),
			expected: expectedProration,
		});
		expectAmountCloseTo({
			actual: intervalLineTotal({
				invoice: prorationInvoice,
				interval: "month",
			}),
			expected: -10,
		});
		expectAmountCloseTo({
			actual: new Decimal(prorationInvoice.total).div(100),
			expected: new Decimal(expectedProration).minus(10),
		});
		expect(
			pendingItemIntervalTotal({
				items: pendingItems.data,
				interval: "year",
			})
				.toDecimalPlaces(2)
				.toNumber(),
		).toBe(0);
		expect(
			pendingItemIntervalTotal({
				items: pendingItems.data,
				interval: "month",
			})
				.toDecimalPlaces(2)
				.toNumber(),
		).toBe(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: customized annual base proration ignores removed monthly prepaid")}`,
	async () => {
		const customerId = "create-schedule-annual-base-proration";
		const group = "annual-base-proration";
		const phase1 = products.base({
			id: "annual-base-proration-phase-1",
			group,
			items: [items.annualPrice({ price: 1 }), items.prepaidMessages()],
		});
		const phase2 = products.base({
			id: "annual-base-proration-phase-2",
			group,
			items: [items.annualPrice({ price: 1 })],
		});

		const {
			customerId: id,
			autumnV1,
			ctx,
			testClockId,
			advancedTo,
		} = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [phase1, phase2] }),
			],
			actions: [],
		});

		const now = advancedTo;
		const transitionAt = addMonths(new Date(now), 1).getTime();

		await autumnV1.billing.createSchedule({
			customer_id: id,
			phases: [
				{
					starts_at: now,
					plans: [
						{
							plan_id: phase1.id,
							customize: {
								price: itemsV2.annualPrice({ amount: 120 }),
								items: [monthlyPrepaidMessages()],
							},
							feature_quantities: [
								{ feature_id: TestFeature.Messages, quantity: 100 },
							],
						},
					],
				},
				{
					starts_at: transitionAt,
					plans: [
						{
							plan_id: phase2.id,
							customize: {
								price: itemsV2.annualPrice({ amount: 240 }),
							},
						},
					],
				},
			],
		});

		const initialCustomer = await autumnV1.customers.get<ApiCustomerV3>(id);
		await expectCustomerInvoiceCorrect({
			customer: initialCustomer,
			count: 1,
			latestTotal: 130,
		});

		const initialInvoice = await latestStripeInvoice({
			ctx,
			customer: initialCustomer,
		});
		const initialSchedules = await stripeSchedulesForCustomer({
			ctx,
			customer: initialCustomer,
		});
		expect(initialSchedules.data[0]?.phases[1]?.proration_behavior).toBe(
			"always_invoice",
		);
		expect(initialSchedules.data[0]?.billing_mode?.type).toBe("flexible");
		const annualPeriod = annualPeriodFromInitialInvoice({
			invoice: initialInvoice,
		});
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: transitionAt,
			waitForSeconds: 30,
		});

		const customerAfterTransition =
			await autumnV1.customers.get<ApiCustomerV3>(id);
		const pendingItems = await pendingStripeInvoiceItems({
			ctx,
			customer: customerAfterTransition,
		});
		const stripeInvoices = await stripeInvoicesForCustomer({
			ctx,
			customer: customerAfterTransition,
		});
		const expectedProration = expectedAnnualProrationDiff({
			oldAmount: 120,
			newAmount: 240,
			transitionAt,
			billingPeriod: annualPeriod,
		});
		expect(customerAfterTransition.invoices).toHaveLength(3);
		expectAutumnInvoiceWithTotal({
			invoices: customerAfterTransition.invoices!,
			total: 10,
		});
		expectAutumnInvoiceWithTotal({
			invoices: customerAfterTransition.invoices!,
			total: new Decimal(expectedProration).minus(10),
		});
		const prorationInvoice = expectStripeInvoiceWithIntervalTotals({
			invoices: stripeInvoices,
			yearTotal: expectedProration,
			monthTotal: -10,
		});
		expectAmountCloseTo({
			actual: intervalLineTotal({
				invoice: prorationInvoice,
				interval: "year",
			}),
			expected: expectedProration,
		});
		expectAmountCloseTo({
			actual: intervalLineTotal({
				invoice: prorationInvoice,
				interval: "month",
			}),
			expected: -10,
		});
		expectAmountCloseTo({
			actual: new Decimal(prorationInvoice.total).div(100),
			expected: new Decimal(expectedProration).minus(10),
		});
		expect(
			pendingItemIntervalTotal({
				items: pendingItems.data,
				interval: "year",
			})
				.toDecimalPlaces(2)
				.toNumber(),
		).toBe(0);
		expect(
			pendingItemIntervalTotal({
				items: pendingItems.data,
				interval: "month",
			})
				.toDecimalPlaces(2)
				.toNumber(),
		).toBe(0);
	},
);
