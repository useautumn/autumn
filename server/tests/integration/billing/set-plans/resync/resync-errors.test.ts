/**
 * Resync guards on billing_cycle_anchor.
 *
 * Contract:
 *   - An anchor in the past is rejected (the caller uses the next period end instead).
 *   - A backdated start with a free trial keeps its existing 400.
 *   - On a live subscription, an anchor after the first future phase starts is rejected.
 */

import { test } from "bun:test";
import {
	FreeTrialDuration,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("set-plans resync errors: an anchor in the past is rejected")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, advancedTo } = await initScenario({
			customerId: "set-plans-resync-past-anchor",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errMessage:
				"billing_cycle_anchor cannot be set to a past timestamp. Use 'now' or a future Unix timestamp in milliseconds.",
			func: () =>
				autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
					customer_id: customerId,
					billing_cycle_anchor: advancedTo - ms.days(5),
					proration_behavior: "none",
					phases: [
						{
							starts_at: advancedTo - ms.days(35),
							plans: [{ plan_id: pro.id }],
						},
					],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans resync errors: a backdated start with a free trial is rejected")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, advancedTo } = await initScenario({
			customerId: "set-plans-resync-trial",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errMessage:
				"Past first phase starts_at cannot be used together with a free trial.",
			func: () =>
				autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
					customer_id: customerId,
					billing_cycle_anchor: advancedTo + ms.days(20),
					proration_behavior: "none",
					free_trial: {
						duration_length: 7,
						duration_type: FreeTrialDuration.Day,
					},
					phases: [
						{
							starts_at: advancedTo - ms.days(10),
							plans: [{ plan_id: pro.id }],
						},
					],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans resync errors: an anchor after the first future phase on a live subscription is rejected")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV2_4, advancedTo } = await initScenario({
			customerId: "set-plans-resync-anchor-after-phase",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await expectAutumnError({
			errMessage:
				"billing_cycle_anchor cannot be after the first future phase starts.",
			func: () =>
				autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
					customer_id: customerId,
					billing_cycle_anchor: advancedTo + ms.days(20),
					phases: [
						{ starts_at: "now", plans: [{ plan_id: pro.id }] },
						{
							starts_at: advancedTo + ms.days(10),
							plans: [{ plan_id: premium.id }],
						},
					],
				}),
		});
	},
);
