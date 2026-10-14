import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeInvoiceLineItemPeriodCorrect } from "@tests/integration/billing/utils/stripe/expectStripeInvoiceLineItemPeriodCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(
	`${chalk.yellowBright("invoice.created entity: regular renewal - overage billed once")}`,
	async () => {
		const customerId = "inv-created-ent-renewal";

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: 100 })],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 500,
					entityIndex: 0,
				}),
			],
		});

		const entityId = entities[0].id;

		const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
		expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

		const advancedTo = await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		const entityFinal = await autumnV1.entities.get(customerId, entityId);
		await expectProductActive({
			customer: entityFinal,
			productId: pro.id,
		});

		expectCustomerFeatureCorrect({
			customer: entityFinal,
			featureId: TestFeature.Messages,
			balance: 100,
			resetsAt: addMonths(Date.now(), 2).getTime(),
		});

		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerInvoiceCorrect({
			customer: customerFinal,
			count: 2,
			latestTotal: 60,
		});

		await expectStripeInvoiceLineItemPeriodCorrect({
			customerId,
			productId: pro.id,
			periodStartMs: Date.now(),
			periodEndMs: advancedTo,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice.created entity: billing units - each entity rounded individually → advance cycle")}`,
	async () => {
		const customerId = "inv-ent-billing-units";

		const consumableItem = items.consumable({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			price: 1,
			billingUnits: 10,
		});

		const pro = products.pro({
			id: "pro",
			items: [consumableItem],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1, timeout: 2000 }),
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
			productId: pro.id,
		});
		expectCustomerFeatureCorrect({
			customer: entity2Final,
			featureId: TestFeature.Messages,
			balance: 100,
		});

		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerInvoiceCorrect({
			customer: customerFinal,
			count: 3,
			latestTotal: 49,
		});
	},
);
