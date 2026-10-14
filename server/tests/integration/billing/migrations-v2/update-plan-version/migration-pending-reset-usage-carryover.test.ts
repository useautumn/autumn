import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../utils/runUpdatePlanMigration";

const ALLOWANCE = 50;
const CONSUMED = 17;

test.concurrent(
	`${chalk.yellowBright("migrations-v2: update_plan during a pending reset does not carry prior-cycle usage")}`,
	async () => {
		const customerId = "pending-reset-usage-carryover";

		const monthlyItem = items.monthlyMessages({
			includedUsage: ALLOWANCE,
		});

		const pro = products.pro({
			id: "pro-pending-reset",
			items: [monthlyItem],
		});

		const { autumnV1, autumnV2_1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: CONSUMED,
					timeout: 4000,
				}),
				s.advanceTestClock({ days: 32 }),
			],
		});

		const beforeMigration =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: beforeMigration,
			featureId: TestFeature.Messages,
			balance: ALLOWANCE,
			usage: 0,
		});

		await autumnV1.products.update(pro.id, {
			items: [monthlyItem, items.dashboard()],
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
			balance: ALLOWANCE,
			usage: 0,
		});
	},
);
