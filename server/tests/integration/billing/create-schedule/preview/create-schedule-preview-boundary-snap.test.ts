import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	ms,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import {
	expectCloseToCents,
	expectPreviewToMatchCreateSchedule,
} from "./utils/createSchedulePreviewUtils";

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 16: replacement landing on the cycle boundary charges the full new plan, not a sliver")}`,
	async () => {
		const pro = products.pro({
			id: "preview-boundary-snap-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "preview-boundary-snap-premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-boundary-snap",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const renewalAt = truncateMsToSecondPrecision(
			addMonths(advancedTo, 1).getTime(),
		);
		const transitionAt = renewalAt - ms.hours(6);

		await expectPreviewToMatchCreateSchedule({
			autumnV1,
			params: {
				customer_id: customerId,
				phases: [
					{ starts_at: advancedTo, plans: [{ plan_id: pro.id }] },
					{ starts_at: transitionAt, plans: [{ plan_id: premium.id }] },
				],
			},
			expectedTotal: 0,
			assertPreview: (preview) => {
				expect(preview.line_items).toHaveLength(0);
				expect(preview.next_cycle).toBeDefined();
				expect(preview.next_cycle?.starts_at).not.toBe(transitionAt);
				expect(
					Math.abs((preview.next_cycle?.starts_at ?? 0) - renewalAt),
				).toBeLessThan(ms.hours(1));
				expectCloseToCents({
					actual: preview.next_cycle?.total ?? 0,
					expected: 50,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 17: snapped boundary bills one full renewal invoice, no sliver")}`,
	async () => {
		const pro = products.pro({
			id: "preview-boundary-snap-billing-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "preview-boundary-snap-billing-premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV1, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId: "create-schedule-preview-boundary-snap-billing",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
				],
				actions: [s.billing.attach({ productId: pro.id })],
			});

		const renewalAt = truncateMsToSecondPrecision(
			addMonths(advancedTo, 1).getTime(),
		);
		const transitionAt = renewalAt - ms.hours(6);

		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{ starts_at: advancedTo, plans: [{ plan_id: pro.id }] },
				{ starts_at: transitionAt, plans: [{ plan_id: premium.id }] },
			],
		});

		const beforeRenewal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: beforeRenewal,
			count: 1,
			latestTotal: 20,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: renewalAt + ms.days(1),
		});

		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: beforeRenewal.stripe_id!,
			limit: 20,
		});
		const invoiceTotals = stripeInvoices.data
			.map((invoice) => invoice.total)
			.filter((total) => total !== 0)
			.sort((a, b) => a - b);
		expect(invoiceTotals).toEqual([2000, 5000]);
	},
);
