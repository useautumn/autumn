/**
 * Customizing a customer's rate card from the dashboard sends the base plan's
 * credits item as remove_items + add_items carrying feature_override. That
 * override must land on the customer's plan and price their usage.
 *
 * Contract:
 *   base plan grants 1,000 credits; the catalog rate card prices action1 at 0.2
 *   customize.add_items overrides action1 to 10 credits
 *   one tracked action1 → balance 990 (not 999.8)
 */

import { test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const INCLUDED_CREDITS = 1_000;
const OVERRIDDEN_ACTION1_COST = 10;

test.concurrent(
	`${chalk.yellowBright("v2-customize attach: a rate-card override on add_items prices the customer's usage")}`,
	async () => {
		const customerId = "v2-attach-customize-override";

		const base = products.base({
			id: "credits-base",
			items: [items.monthlyCredits({ includedUsage: INCLUDED_CREDITS })],
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [base] }),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: base.id,
			redirect_mode: "if_required",
			customize: {
				remove_items: [
					{
						feature_id: TestFeature.Credits,
						interval: ResetInterval.Month,
						interval_count: 1,
					},
				],
				add_items: [
					{
						feature_id: TestFeature.Credits,
						included: INCLUDED_CREDITS,
						reset: { interval: ResetInterval.Month },
						feature_override: {
							credit_schema: [
								{
									metered_feature_id: TestFeature.Action1,
									credit_cost: OVERRIDDEN_ACTION1_COST,
								},
								{ metered_feature_id: TestFeature.Action2, credit_cost: 0.6 },
							],
						},
					},
				],
			},
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 1,
		});

		await expectCustomerFeatureCorrect({
			customerId,
			autumn: autumnV1,
			featureId: TestFeature.Credits,
			includedUsage: INCLUDED_CREDITS,
			balance: INCLUDED_CREDITS - OVERRIDDEN_ACTION1_COST,
		});
	},
);
