/**
 * Re-requesting a custom plan whose base price is a stored $0/month keeps it, as the dashboard sends it.
 *
 * Red (before):  the dashboard sent its $0 base price as `price: null`, so the plan read as changed —
 *                set_plans replaced the row and moved its balance ("1 updated") though nothing changed.
 * Green (after): the stored $0 price round-trips, the plan is kept and no balance changes.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	ResetInterval,
	type SetPlansParamsV0Input,
	type SetPlansPreviewResponse,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const INCLUDED_MESSAGES = 135;

/** The dashboard's customize for an untouched custom plan with a $0/month base price. */
const unchangedFreeCustomize = {
	price: { amount: 0, interval: BillingInterval.Month },
	items: [
		{
			feature_id: TestFeature.Messages,
			included: INCLUDED_MESSAGES,
			reset: { interval: ResetInterval.Month },
		},
	],
};

const keptPlanIds = (preview: SetPlansPreviewResponse) =>
	preview.phases[0]?.plans
		.filter((plan) => plan.status === "kept")
		.map((plan) => plan.plan_id)
		.sort();

test.concurrent(
	`${chalk.yellowBright("set-plans unchanged custom: a stored $0 base price keeps the plan and its balance")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyWords({ includedUsage: 50 })],
		});
		const credits = products.base({ id: "credits", isAddOn: true, items: [] });

		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "set-plans-kept-free-custom",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, credits] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({
					productId: credits.id,
					items: [
						items.monthlyPrice({ price: 0 }),
						items.monthlyMessages({ includedUsage: INCLUDED_MESSAGES }),
					],
				}),
			],
		});

		const preview =
			await autumnV2_4.billing.previewSetPlans<SetPlansParamsV0Input>({
				customer_id: customerId,
				phases: [
					{
						starts_at: "now",
						plans: [
							{ plan_id: pro.id },
							{ plan_id: credits.id, customize: unchangedFreeCustomize },
						],
					},
				],
			});

		expect(preview.total).toBe(0);
		expect(keptPlanIds(preview)).toEqual([credits.id, pro.id].sort());
		expect(preview.phases[0]?.balance_changes).toEqual([]);
	},
);
