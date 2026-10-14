import { expect, test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("immediate-switch-entities 4: entity downgrade scheduled, then upgrade")}`,
	async () => {
		const customerId = "imm-switch-ent-down-then-up";

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

		const growthMessages = items.monthlyMessages({ includedUsage: 2000 });
		const growth = products.growth({
			id: "growth",
			items: [growthMessages],
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, growth] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: premium.id, entityIndex: 0 }),
				s.billing.attach({ productId: premium.id, entityIndex: 1 }),
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			],
		});

		const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		await expectProductCanceling({
			customer: entity1Before,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: entity1Before,
			productId: pro.id,
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: growth.id,
			entity_id: entities[0].id,
		});
		expect(preview.total).toBe(50);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: growth.id,
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

		await expectCustomerProducts({
			customer: entity1,
			active: [growth.id],
			notPresent: [premium.id, pro.id],
		});
		expectCustomerFeatureCorrect({
			customer: entity1,
			featureId: TestFeature.Messages,
			includedUsage: 2000,
			balance: 2000,
		});

		await expectProductActive({
			customer: entity2,
			productId: premium.id,
		});
	},
);
