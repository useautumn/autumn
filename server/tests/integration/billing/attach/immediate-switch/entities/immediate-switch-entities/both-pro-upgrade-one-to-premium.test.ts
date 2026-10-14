import { expect, test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("immediate-switch-entities 3: both pro, upgrade one to premium")}`,
	async () => {
		const customerId = "imm-switch-ent-pro-to-premium";

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({
			id: "pro",
			items: [proMessages],
		});

		const premiumMessages = items.monthlyMessages({ includedUsage: 1000 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
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

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[1].id,
		});
		expect(preview.total).toBe(30);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[1].id,
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
			productId: pro.id,
		});
		expectCustomerFeatureCorrect({
			customer: entity1,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
		});

		await expectCustomerProducts({
			customer: entity2,
			active: [premium.id],
			notPresent: [pro.id],
		});
		expectCustomerFeatureCorrect({
			customer: entity2,
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			balance: 1000,
		});
	},
);
