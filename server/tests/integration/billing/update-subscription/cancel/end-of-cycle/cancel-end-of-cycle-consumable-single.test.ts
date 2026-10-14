import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("cancel end of cycle consumable: customer - track overage → cancel → advance")}`,
	async () => {
		const customerId = "cancel-eoc-cons-cus";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [consumableItem],
		});

		const { autumnV1Beta, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const customerAfterAttach =
			await autumnV1Beta.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({
			customer: customerAfterAttach,
			productId: pro.id,
		});

		expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 1,
			latestTotal: 20,
		});

		await autumnV1Beta.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 500,
		});

		await autumnV1Beta.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		const customerAfterCancel =
			await autumnV1Beta.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerAfterCancel,
			productId: pro.id,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			beforeFinalize: async () =>
				expectCustomerInvoiceCorrect({
					customerId,
					autumn: autumnV1Beta,
					count: 2,
					latestTotal: 40,
				}),
		});

		const expectedOverage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Messages, value: 500 }],
			options: { includeFixed: false, onlyArrear: true },
		});

		expect(expectedOverage).toBe(40);

		const customerAfterAdvance =
			await autumnV1Beta.customers.get<ApiCustomerV3>(customerId);

		await expectProductNotPresent({
			customer: customerAfterAdvance,
			productId: pro.id,
		});

		expectCustomerInvoiceCorrect({
			customer: customerAfterAdvance,
			count: 2,
			latestTotal: expectedOverage,
			latestInvoiceProductId: pro.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cancel end of cycle consumable: entity - track overage → cancel → advance")}`,
	async () => {
		const customerId = "cancel-eoc-cons-ent";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [consumableItem],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
		});

		const entityId = entities[0].id;

		const entity = await autumnV1.entities.get(customerId, entityId);
		await expectProductActive({
			customer: entity,
			productId: pro.id,
		});

		await autumnV1.track({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			value: 500,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entityId,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
		await expectProductCanceling({
			customer: entityAfterCancel,
			productId: pro.id,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			beforeFinalize: async () =>
				expectCustomerInvoiceCorrect({
					customerId,
					autumn: autumnV1,
					count: 2,
					latestTotal: 40,
				}),
		});

		const entityAfterAdvance = await autumnV1.entities.get(
			customerId,
			entityId,
		);

		await expectProductNotPresent({
			customer: entityAfterAdvance,
			productId: pro.id,
		});

		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(customerAfterAdvance.invoices?.length).toBe(2);

		expect(customerAfterAdvance.invoices?.[0].total).toBe(40);
	},
);
