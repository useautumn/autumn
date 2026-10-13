/**
 * invoices.create — per-line periods.
 *
 * Contract:
 *   - A line's period is its own, else its parent's (license, plan), else the envelope.
 *   - Without an envelope, the envelope spans the earliest line start to the latest line end.
 *   - Each line prorates over, and prints, its own period; a line outside a given envelope is a 400.
 */

import { expect, test } from "bun:test";
import {
	BillingMethod,
	type CreateInvoiceParamsInput,
	ErrCode,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	createInvoice,
	expectCreatedInvoiceCorrect,
} from "./utils/expectCreatedInvoiceCorrect";

const JAN_1 = Date.UTC(2026, 0, 1);
const JAN_16 = Date.UTC(2026, 0, 16);
const FEB_1 = Date.UTC(2026, 1, 1);
const FEB_15 = Date.UTC(2026, 1, 15);

const toSeconds = (ms: number) => Math.floor(ms / 1000);

const setupPlan = async ({ customerId }: { customerId: string }) => {
	const plan = products.base({
		id: `periods-${customerId}`,
		items: [
			items.monthlyPrice({ price: 100 }),
			items.prepaidUsers(),
			items.consumableMessages({ price: 0.1 }),
		],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan] }),
		],
		actions: [],
	});
	return { ...scenario, plan };
};

test.concurrent(
	`${chalk.yellowBright("invoices.create periods: each line prorates over and prints its own period")}`,
	async () => {
		const customerId = "inv-create-line-periods";
		const { autumnV2_3, ctx, plan } = await setupPlan({ customerId });

		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				plans: [
					{
						plan_id: plan.id,
						period_start: JAN_1,
						period_end: JAN_16,
						feature_quantities: [
							{
								feature_id: TestFeature.Users,
								billing_behavior: BillingMethod.Prepaid,
								quantity: 2,
								period_start: JAN_1,
								period_end: FEB_1,
							},
							{
								feature_id: TestFeature.Messages,
								billing_behavior: BillingMethod.UsageBased,
								quantity: 100,
							},
						],
					},
				],
				custom_line_items: [
					{
						description: "Setup",
						amount: 5,
						period_start: JAN_1,
						period_end: FEB_1,
					},
				],
			},
		});

		// Base: $100 × 15/31. Users: a whole month, so $20. Messages: usage, not prorated.
		const { stripeInvoice } = await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [
				{ amount: 48.39, prorated: true },
				{ amount: 20, quantity: 2, prorated: true },
				{ amount: 10, quantity: 100, prorated: false },
				{ amount: 5 },
			],
			total: 83.39,
		});
		const periods = [
			[JAN_1, JAN_16],
			[JAN_1, FEB_1],
			[JAN_1, JAN_16],
			[JAN_1, FEB_1],
		];
		expect(
			response.preview.lines.map((line) => [
				line.period_start,
				line.period_end,
			]),
		).toEqual(periods);

		const stripeLines = await ctx.stripeCli.invoices.listLineItems(
			stripeInvoice.id,
			{ limit: 100 },
		);
		expect(
			stripeLines.data
				.map((line) => [line.period.start, line.period.end])
				.sort(),
		).toEqual(
			periods.map(([start, end]) => [toSeconds(start), toSeconds(end)]).sort(),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create periods: lines inherit the envelope, and a line outside it is a 400")}`,
	async () => {
		const customerId = "inv-create-line-periods-envelope";
		const { autumnV2_3, plan } = await setupPlan({ customerId });

		const { preview } = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				preview: true,
				period_start: JAN_1,
				period_end: FEB_1,
				plans: [
					{
						plan_id: plan.id,
						feature_quantities: [
							{
								feature_id: TestFeature.Users,
								billing_behavior: BillingMethod.Prepaid,
								quantity: 2,
								period_start: JAN_16,
								period_end: FEB_1,
							},
						],
					},
				],
			},
		});
		expect(
			preview.lines.map((line) => [line.period_start, line.period_end]),
		).toEqual([
			[JAN_1, FEB_1],
			[JAN_16, FEB_1],
		]);

		const outside: CreateInvoiceParamsInput = {
			customer_id: customerId,
			preview: true,
			period_start: JAN_1,
			period_end: FEB_1,
			plans: [{ plan_id: plan.id, period_start: JAN_16, period_end: FEB_15 }],
		};
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () => createInvoice({ autumnV2_3, params: outside }),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create periods: a license and its features take the license period")}`,
	async () => {
		const customerId = "inv-create-line-periods-license";
		const parent = products.pro({ id: `pro-${customerId}`, items: [] });
		const seat = products.base({
			id: `seat-${customerId}`,
			items: [
				items.monthlyPrice({ price: 15 }),
				items.consumableMessages({ price: 0.2 }),
			],
		});
		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 0,
				}),
			],
		});

		const { preview } = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				preview: true,
				plans: [
					{
						plan_id: parent.id,
						customize: { price: null },
						license_quantities: [
							{
								license_plan_id: seat.id,
								quantity: 2,
								period_start: JAN_1,
								period_end: JAN_16,
								feature_quantities: [
									{
										feature_id: TestFeature.Messages,
										billing_behavior: BillingMethod.UsageBased,
										quantity: 10,
									},
								],
							},
						],
					},
				],
			},
		});

		// Seats: 2 × $15 × 15/31. Messages: 10 × $0.20, printed over the license period.
		expect(
			preview.lines.map((line) => ({
				amount: line.amount,
				period: [line.period_start, line.period_end],
			})),
		).toEqual([
			{ amount: 14.52, period: [JAN_1, JAN_16] },
			{ amount: 2, period: [JAN_1, JAN_16] },
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create periods: without a top-level period, lines without their own never inherit one")}`,
	async () => {
		const customerId = "inv-create-line-periods-derived";
		const { autumnV2_3, plan } = await setupPlan({ customerId });

		const { preview } = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				preview: true,
				plans: [{ plan_id: plan.id }],
				custom_line_items: [
					{
						description: "Annual support",
						amount: 0,
						period_start: JAN_1,
						period_end: Date.UTC(2027, 0, 1),
					},
					{ description: "Setup", amount: 5 },
				],
			},
		});

		// The plan bills one month, unprorated and with no period, exactly as without the custom line.
		expect(
			preview.lines.map((line) => ({
				amount: line.amount,
				prorated: line.prorated,
				period: [line.period_start, line.period_end],
			})),
		).toEqual([
			{ amount: 100, prorated: false, period: [null, null] },
			{ amount: 5, prorated: false, period: [null, null] },
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create periods: base and seat descriptions leave the period to the line's own period")}`,
	async () => {
		const customerId = "inv-create-line-periods-description";
		const parent = products.pro({ id: `pro-${customerId}`, items: [] });
		const seat = products.base({
			id: `seat-${customerId}`,
			items: [items.monthlyPrice({ price: 15 })],
		});
		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 0,
				}),
			],
		});

		const { preview } = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				preview: true,
				period_start: JAN_1,
				period_end: FEB_1,
				plans: [
					{
						plan_id: parent.id,
						license_quantities: [
							{
								license_plan_id: seat.id,
								quantity: 2,
								period_start: JAN_1,
								period_end: JAN_16,
							},
						],
					},
				],
			},
		});

		expect(
			preview.lines.map((line) => ({
				description: line.description,
				period: [line.period_start, line.period_end],
			})),
		).toEqual([
			{ description: parent.name, period: [JAN_1, FEB_1] },
			{ description: `2x ${seat.name}`, period: [JAN_1, JAN_16] },
		]);
	},
);
