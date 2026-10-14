import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../utils/runUpdatePlanMigration";

test.concurrent(
	`${chalk.yellowBright("one-off-preserve migrations-v2: update_plan v1->v2 preserves remaining one-off prepaid balance, no new invoice")}`,
	async () => {
		const customerId = "one-off-preserve-migration";

		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const pro = products.pro({
			id: "pro-mig-one-off",
			items: [oneOffItem],
		});

		const { autumnV1, autumnV2_1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const invoiceCountBefore =
			(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
				?.length ?? 0;

		await autumnV1.products.update(pro.id, {
			items: [items.monthlyPrice({ price: 20 }), oneOffItem, items.dashboard()],
		});

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: pro.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: pro.id },
						version: 2,
					},
				],
			},
			runOnServer: false,
		});

		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({ customer: customerV3, active: [pro.id] });
		expect(customerV3.features?.[TestFeature.Dashboard]).toBeDefined();

		expectCustomerFeatureCorrect({
			customer: customerV3,
			featureId: TestFeature.Messages,
			balance: 150,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: invoiceCountBefore,
		});
	},
);
