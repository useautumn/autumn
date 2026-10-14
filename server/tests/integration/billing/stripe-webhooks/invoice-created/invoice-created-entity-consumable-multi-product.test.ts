import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("invoice.created entity: 2 entities, 2 different products → advance cycle")}`,
	async () => {
		const customerId = "inv-ent-2prod-2ent";

		const proConsumable = items.consumable({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			price: 1,
			billingUnits: 10,
		});

		const premiumConsumable = items.consumable({
			featureId: TestFeature.Messages,
			includedUsage: 200,
			price: 2,
			billingUnits: 25,
		});

		const pro = products.pro({
			id: "pro",
			items: [proConsumable],
		});

		const premium = products.base({
			id: "premium",
			items: [premiumConsumable, items.monthlyPrice({ price: 50 })],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: premium.id, entityIndex: 1, timeout: 2000 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 175,
					entityIndex: 0,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 289,
					entityIndex: 1,
				}),
			],
		});

		const entity1AfterTrack = await autumnV1.entities.get(
			customerId,
			entities[0].id,
		);
		expect(entity1AfterTrack.features[TestFeature.Messages].balance).toBe(-75);

		const entity2AfterTrack = await autumnV1.entities.get(
			customerId,
			entities[1].id,
		);
		expect(entity2AfterTrack.features[TestFeature.Messages].balance).toBe(-89);

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		const entity1Final = await autumnV1.entities.get(
			customerId,
			entities[0].id,
		);
		await expectProductActive({
			customer: entity1Final,
			productId: pro.id,
		});
		expectCustomerFeatureCorrect({
			customer: entity1Final,
			featureId: TestFeature.Messages,
			balance: 100,
		});

		const entity2Final = await autumnV1.entities.get(
			customerId,
			entities[1].id,
		);
		await expectProductActive({
			customer: entity2Final,
			productId: premium.id,
		});
		expectCustomerFeatureCorrect({
			customer: entity2Final,
			featureId: TestFeature.Messages,
			balance: 200,
		});

		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerInvoiceCorrect({
			customer: customerFinal,
			count: 3,
			latestTotal: 86,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice.created entity: 4 entities, 2 products (2 each) → advance cycle")}`,
	async () => {
		const customerId = "inv-ent-4ent-2prod";

		const proConsumable = items.consumable({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			price: 1,
			billingUnits: 10,
		});

		const premiumConsumable = items.consumable({
			featureId: TestFeature.Messages,
			includedUsage: 200,
			price: 2,
			billingUnits: 25,
		});

		const pro = products.pro({
			id: "pro",
			items: [proConsumable],
		});

		const premium = products.base({
			id: "premium",
			items: [premiumConsumable, items.monthlyPrice({ price: 50 })],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 4, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
				s.attach({ productId: premium.id, entityIndex: 2 }),
				s.attach({ productId: premium.id, entityIndex: 3, timeout: 2000 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 155,
					entityIndex: 0,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 123,
					entityIndex: 1,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 275,
					entityIndex: 2,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 351,
					entityIndex: 3,
				}),
			],
		});

		const entity1AfterTrack = await autumnV1.entities.get(
			customerId,
			entities[0].id,
		);
		expect(entity1AfterTrack.features[TestFeature.Messages].balance).toBe(-55);

		const entity2AfterTrack = await autumnV1.entities.get(
			customerId,
			entities[1].id,
		);
		expect(entity2AfterTrack.features[TestFeature.Messages].balance).toBe(-23);

		const entity3AfterTrack = await autumnV1.entities.get(
			customerId,
			entities[2].id,
		);
		expect(entity3AfterTrack.features[TestFeature.Messages].balance).toBe(-75);

		const entity4AfterTrack = await autumnV1.entities.get(
			customerId,
			entities[3].id,
		);
		expect(entity4AfterTrack.features[TestFeature.Messages].balance).toBe(-151);

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		const entity1Final = await autumnV1.entities.get(
			customerId,
			entities[0].id,
		);
		await expectProductActive({ customer: entity1Final, productId: pro.id });
		expectCustomerFeatureCorrect({
			customer: entity1Final,
			featureId: TestFeature.Messages,
			balance: 100,
		});

		const entity2Final = await autumnV1.entities.get(
			customerId,
			entities[1].id,
		);
		await expectProductActive({ customer: entity2Final, productId: pro.id });
		expectCustomerFeatureCorrect({
			customer: entity2Final,
			featureId: TestFeature.Messages,
			balance: 100,
		});

		const entity3Final = await autumnV1.entities.get(
			customerId,
			entities[2].id,
		);
		await expectProductActive({
			customer: entity3Final,
			productId: premium.id,
		});
		expectCustomerFeatureCorrect({
			customer: entity3Final,
			featureId: TestFeature.Messages,
			balance: 200,
		});

		const entity4Final = await autumnV1.entities.get(
			customerId,
			entities[3].id,
		);
		await expectProductActive({
			customer: entity4Final,
			productId: premium.id,
		});
		expectCustomerFeatureCorrect({
			customer: entity4Final,
			featureId: TestFeature.Messages,
			balance: 200,
		});

		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerInvoiceCorrect({
			customer: customerFinal,
			count: 5,
			latestTotal: 169,
		});
	},
);
