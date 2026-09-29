// set_plans keeps the billing cycle anchor that setup works out for its plans.

import { test } from "bun:test";
import {
	anchoredToMonthStart,
	expectStripeSubscriptionAnchorCorrect,
	nextMonthStartMs,
} from "@tests/integration/billing/attach/params/anchor-to-month-start/utils/anchorToMonthStartUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("set-plans anchor: month-start plan with no requested anchor anchors to the 1st")}`,
	async () => {
		const pro = anchoredToMonthStart(
			products.pro({
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
		);

		const { customerId, autumnV2_4, advancedTo } = await initScenario({
			customerId: "set-plans-month-start-anchor",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		});

		await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: nextMonthStartMs({ fromMs: advancedTo }),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans anchor: month-start plan starting at a numeric now anchors to the 1st")}`,
	async () => {
		const pro = anchoredToMonthStart(
			products.pro({
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
		);

		const { customerId, autumnV2_4, advancedTo } = await initScenario({
			customerId: "set-plans-month-start-numeric",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: advancedTo, plans: [{ plan_id: pro.id }] }],
		});

		await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: nextMonthStartMs({ fromMs: advancedTo }),
		});
	},
);
