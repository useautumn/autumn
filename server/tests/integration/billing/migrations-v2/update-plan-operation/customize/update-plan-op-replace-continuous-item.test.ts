/** Red: replacing a monthly paid continuous-use item drops its grant.
 * Green: the replacement free item grants 100 units and keeps the $20 charge. */
import { test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	BillingInterval,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: replace paid continuous-use item with included grant")}`,
	async () => {
		const customerId = "migration-update-replace-continuous-item";
		const domains = products.base({
			id: "migration-domains-addon",
			isAddOn: true,
			items: [
				items.prepaid({
					featureId: TestFeature.Users,
					price: 20,
					billingUnits: 100,
				}),
			],
		});
		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [domains] }),
			],
			actions: [
				s.billing.attach({
					productId: domains.id,
					options: [{ feature_id: TestFeature.Users, quantity: 100 }],
				}),
			],
		});

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: domains.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: domains.id },
						customize: {
							price: itemsV2.monthlyPrice({ amount: 20 }),
							remove_items: [
								{
									feature_id: TestFeature.Users,
									interval: BillingInterval.Month,
								},
							],
							add_items: [{ feature_id: TestFeature.Users, included: 100 }],
						},
					},
				],
			},
			runOnServer: false,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Users,
			granted: 100,
			remaining: 100,
			planId: domains.id,
		});
		await expectCustomerInvoiceCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			count: 1,
			latestTotal: 20,
		});
	},
);
