import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeInvoiceLineItemPeriodCorrect } from "@tests/integration/billing/utils/stripe/expectStripeInvoiceLineItemPeriodCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(
	`${chalk.yellowBright("cancel end of cycle consumable: entity + customer - cancel customer (no double billing)")}`,
	async () => {
		const customerId = "cancel-eoc-cons-ent-cus";

		const customerConsumable = items.consumableMessages({ includedUsage: 100 });

		const entityConsumable = items.consumableMessages({ includedUsage: 100 });

		const customerPro = products.pro({
			id: "customer-pro",
			items: [customerConsumable],
		});

		const entityPro = products.pro({
			id: "entity-pro",
			items: [entityConsumable],
		});

		const { autumnV1, autumnV2_2, ctx, testClockId, entities } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [customerPro, entityPro] }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
				],
				actions: [
					s.attach({ productId: customerPro.id }),
					s.attach({ productId: entityPro.id, entityIndex: 0, timeout: 4000 }),
					s.warmEntityCaches(),
					s.track({ featureId: TestFeature.Messages, value: 300 }),
					s.track({
						featureId: TestFeature.Messages,
						value: 250,
						entityIndex: 0,
					}),
				],
			});

		const entityId = entities[0].id;
		await expectBalanceCorrect({
			autumn: autumnV2_2,
			customerId,
			entityId,
			featureId: TestFeature.Messages,
			granted: 200,
			remaining: 0,
			usage: 550,
			skipCache: true,
		});
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: customerPro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 2,
		});

		const customerAfterTrack =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);

		expectCustomerFeatureCorrect({
			customer: customerAfterTrack,
			featureId: TestFeature.Messages,
			balance: -200,
			usage: isBalanceWorkerRoute() ? 300 : 550,
			includedUsage: isBalanceWorkerRoute() ? 100 : 200,
		});

		expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-350);

		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerAfterCancel,
			productId: customerPro.id,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			beforeFinalize: async () =>
				expectCustomerInvoiceCorrect({
					customerId,
					autumn: autumnV1,
					count: 3,
					latestTotal: 55,
				}),
		});

		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductNotPresent({
			customer: customerFinal,
			productId: customerPro.id,
		});

		const entityFinal = await autumnV1.entities.get(customerId, entityId);
		await expectProductActive({
			customer: entityFinal,
			productId: entityPro.id,
		});

		expectCustomerFeatureCorrect({
			customer: entityFinal,
			featureId: TestFeature.Messages,
			balance: 100,
			resetsAt: addMonths(Date.now(), 2).getTime(),
		});
		if (isBalanceWorkerRoute()) {
			expect(customerFinal.features[TestFeature.Messages]).toBeUndefined();
		} else {
			expectCustomerFeatureCorrect({
				customer: customerFinal,
				featureId: TestFeature.Messages,
				balance: 100,
				includedUsage: 100,
				usage: 0,
			});
			expect(
				customerFinal.features[TestFeature.Messages].next_reset_at ?? null,
			).toBeNull();
		}

		const overageTotal = 35;
		expectCustomerInvoiceCorrect({
			customer: customerFinal,
			count: 3,
			latestTotal: overageTotal + 20,
		});

		await expectStripeInvoiceLineItemPeriodCorrect({
			customerId,
			productId: entityPro.id,
			periodStartMs: Date.now(),
			periodEndMs: addMonths(Date.now(), 1).getTime(),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cancel end of cycle consumable: entity + customer - cancel both (no double billing)")}`,
	async () => {
		const customerId = "cancel-eoc-cons-both";

		const customerConsumable = items.consumableMessages({ includedUsage: 100 });

		const entityConsumable = items.consumableMessages({ includedUsage: 100 });

		const customerPro = products.pro({
			id: "customer-pro",
			items: [customerConsumable],
		});

		const entityPro = products.pro({
			id: "entity-pro",
			items: [entityConsumable],
		});

		const { autumnV1, autumnV2_2, ctx, testClockId, entities } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [customerPro, entityPro] }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
				],
				actions: [
					s.attach({ productId: customerPro.id }),
					s.attach({ productId: entityPro.id, entityIndex: 0, timeout: 4000 }),
					s.warmEntityCaches(),
					s.track({ featureId: TestFeature.Messages, value: 300 }),
					s.track({
						featureId: TestFeature.Messages,
						value: 250,
						entityIndex: 0,
					}),
				],
			});

		const entityId = entities[0].id;
		await expectBalanceCorrect({
			autumn: autumnV2_2,
			customerId,
			entityId,
			featureId: TestFeature.Messages,
			granted: 200,
			remaining: 0,
			usage: 550,
			skipCache: true,
		});
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: customerPro.id,
			cancel_action: "cancel_end_of_cycle",
		});
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entityId,
			product_id: entityPro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		const customerAfterTrack =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);

		expectCustomerFeatureCorrect({
			customer: customerAfterTrack,
			featureId: TestFeature.Messages,
			balance: -200,
			usage: isBalanceWorkerRoute() ? 300 : 550,
			includedUsage: isBalanceWorkerRoute() ? 100 : 200,
		});
		expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-350);

		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerAfterCancel,
			productId: customerPro.id,
		});

		const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
		await expectProductCanceling({
			customer: entityAfterCancel,
			productId: entityPro.id,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			beforeFinalize: async () =>
				expectCustomerInvoiceCorrect({
					customerId,
					autumn: autumnV1,
					count: 3,
					latestTotal: 35,
				}),
		});

		const customerFinal = await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 3,
			latestTotal: 35,
			latestStatus: "paid",
		});
		await expectProductNotPresent({
			customer: customerFinal,
			productId: customerPro.id,
		});

		const entityFinal = await autumnV1.entities.get(customerId, entityId);
		await expectProductNotPresent({
			customer: entityFinal,
			productId: entityPro.id,
		});

		await expectStripeInvoiceLineItemPeriodCorrect({
			customerId,
			productId: entityPro.id,
			periodStartMs: Date.now(),
			periodEndMs: addMonths(Date.now(), 1).getTime(),
		});
	},
);
