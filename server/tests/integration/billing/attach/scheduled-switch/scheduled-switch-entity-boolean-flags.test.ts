import { expect, test } from "bun:test";
import { type ApiEntityV2, ApiEntityV2Schema } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

test.concurrent(
	`${chalk.yellowBright(
		"scheduled-switch boolean flags 1: scheduled upgrade cus_product must NOT shadow active cus_product's boolean flag",
	)}`,
	async () => {
		const customerId = "sched-switch-bool-flags-scheduled";

		const pro = products.pro({
			id: "bool-flags-sched-pro",
			items: [items.dashboard(), items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "bool-flags-sched-premium",
			items: [items.dashboard(), items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_2, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.billing.attach({
					productId: premium.id,
					entityIndex: 0,
					planSchedule: "end_of_cycle",
				}),
			],
		});

		const entityId = entities[0].id;

		const entity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entityId,
			{ keepInternalFields: true },
		);
		ApiEntityV2Schema.parse(entity);

		expect(entity.flags[TestFeature.Dashboard]).toBeDefined();
		expect(entity.flags[TestFeature.Dashboard]).toMatchObject({
			feature_id: TestFeature.Dashboard,
			plan_id: pro.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright(
		"scheduled-switch boolean flags 2: loose entity-bound extra must NOT shadow active cus_product's boolean flag",
	)}`,
	async () => {
		const customerId = "sched-switch-bool-flags-loose";

		const customerProd = products.pro({
			id: "bool-flags-loose-pro",
			items: [items.dashboard(), items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2, autumnV2_2, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [customerProd] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		const entityId = entities[0].id;

		await autumnV2.balances.create({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Dashboard,
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: customerProd.id,
			redirect_mode: "if_required",
		});

		const entity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entityId,
			{ keepInternalFields: true },
		);
		ApiEntityV2Schema.parse(entity);

		expect(entity.flags[TestFeature.Dashboard]).toBeDefined();
		expect(entity.flags[TestFeature.Dashboard]).toMatchObject({
			feature_id: TestFeature.Dashboard,
			plan_id: customerProd.id,
		});
	},
);
