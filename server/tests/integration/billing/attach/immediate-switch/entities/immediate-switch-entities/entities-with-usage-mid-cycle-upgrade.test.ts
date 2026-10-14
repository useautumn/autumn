import { expect, test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("immediate-switch-entities 7: entities with usage, mid-cycle upgrade")}`,
	async () => {
		const customerId = "imm-switch-ent-usage-midcycle";

		const proConsumable = items.consumableMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [proConsumable],
		});

		const premiumConsumable = items.consumableMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium",
			items: [premiumConsumable],
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

		await new Promise((r) => setTimeout(r, 4000));

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entities[0].id,
			value: 50,
		});
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entities[1].id,
			value: 75,
		});

		await new Promise((r) => setTimeout(r, 2000));

		const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);
		expectCustomerFeatureCorrect({
			customer: entity1Before,
			featureId: TestFeature.Messages,
			balance: 50,
			usage: 50,
		});
		expectCustomerFeatureCorrect({
			customer: entity2Before,
			featureId: TestFeature.Messages,
			balance: 25,
			usage: 75,
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[0].id,
		});
		expect(preview.total).toBe(30);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[0].id,
			redirect_mode: "if_required",
		});

		const entity1 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		const entity2 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);

		await expectProductActive({
			customer: entity1,
			productId: premium.id,
		});
		expectCustomerFeatureCorrect({
			customer: entity1,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
		});

		await expectProductActive({
			customer: entity2,
			productId: pro.id,
		});
		expectCustomerFeatureCorrect({
			customer: entity2,
			featureId: TestFeature.Messages,
			balance: 25,
			usage: 75,
		});
	},
);
