/**
 * set_plans rejects requests the customer's billing state can't support.
 *
 * Red (before):  currency conflicts reached Stripe, or were scheduled to fail later.
 * Green (after): each request is rejected with a 400 before any write.
 */

import { test } from "bun:test";
import { ErrCode, ms } from "@autumn/shared";
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
