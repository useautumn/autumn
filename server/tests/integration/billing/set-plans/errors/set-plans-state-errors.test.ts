/** set_plans rejects, before any write, requests the customer's billing state can't support. */

import { expect, test } from "bun:test";
import { ErrCode, ms } from "@autumn/shared";
import { getProductStripeId } from "@tests/integration/billing/create-schedule/utils/createScheduleTestHelpers";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("set-plans state errors: customer locked to USD cannot switch to EUR")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "set-plans-currency-locked",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await expectAutumnError({
			errCode: ErrCode.CurrencyMismatch,
			errMessage: "Customer is locked to USD and cannot be billed in EUR",
			func: () =>
				autumnV2_4.billing.setPlans({
					customer_id: customerId,
					currency: "eur",
					phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans state errors: a scheduled plan must offer the customer's currency")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, advancedTo } = await initScenario({
			customerId: "set-plans-currency-scheduled",
			setup: [
				s.customer({ paymentMethod: "success", data: { currency: "eur" } }),
				s.products({ list: [free, pro] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.CurrencyMismatch,
			errMessage: `This customer pays in EUR, but plan '${pro.name}' has no EUR price`,
			func: () =>
				autumnV2_4.billing.setPlans({
					customer_id: customerId,
					phases: [
						{ starts_at: "now", plans: [{ plan_id: free.id }] },
						{
							starts_at: advancedTo + ms.days(30),
							plans: [{ plan_id: pro.id }],
						},
					],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans state errors: a rejected request creates no Stripe product for its free phase")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV2_4, ctx, advancedTo } = await initScenario({
			customerId: "set-plans-free-phase-no-write",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium], createInStripe: false }),
			],
			actions: [],
		});

		const phases = [
			{ starts_at: "now" as const, plans: [{ plan_id: free.id }] },
			{
				starts_at: advancedTo + ms.days(30),
				plans: [{ plan_id: pro.id }],
			},
		];

		await expectAutumnError({
			func: () =>
				autumnV2_4.billing.setPlans({
					customer_id: customerId,
					unscheduled_plans: [{ plan_id: premium.id }],
					phases,
				}),
		});
		expect(await getProductStripeId({ ctx, productId: free.id })).toBeNull();

		await autumnV2_4.billing.setPlans({ customer_id: customerId, phases });
		expect(await getProductStripeId({ ctx, productId: free.id })).toStartWith(
			"prod_",
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans state errors: a trial plan cannot reset the billing cycle now")}`,
	async () => {
		const proTrial = products.proWithTrial({
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
		});

		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "set-plans-trial-anchor-now",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage:
				"billing_cycle_anchor cannot be used together with a free trial",
			func: () =>
				autumnV2_4.billing.setPlans({
					customer_id: customerId,
					billing_cycle_anchor: "now",
					phases: [{ starts_at: "now", plans: [{ plan_id: proTrial.id }] }],
				}),
		});
	},
);
