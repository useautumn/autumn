import { test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	BILLING_UNITS,
	INCLUDED_USAGE,
	PREMIUM_BASE,
	PRICE_PER_UNIT,
	PRO_BASE,
	prepaidCost,
} from "./utils/scheduledSwitchPrepaidEntities";

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-entities-prepaid 3: both entities premium→pro, advance cycle")}`,
	async () => {
		const customerId = "sched-prepaid-ent-both-down";
		const premiumQuantity = 500;
		const proQuantity = 300;

		const prepaidItem = items.prepaidMessages({
			includedUsage: INCLUDED_USAGE,
			billingUnits: BILLING_UNITS,
			price: PRICE_PER_UNIT,
		});

		const premium = products.premium({
			id: "premium-prepaid",
			items: [prepaidItem],
		});
		const pro = products.pro({
			id: "pro-prepaid",
			items: [prepaidItem],
		});

		const { autumnV1, entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: premium.id,
					entityIndex: 0,
					options: [
						{ feature_id: TestFeature.Messages, quantity: premiumQuantity },
					],
				}),
				s.billing.attach({
					productId: premium.id,
					entityIndex: 1,
					options: [
						{ feature_id: TestFeature.Messages, quantity: premiumQuantity },
					],
				}),
				s.billing.attach({
					productId: pro.id,
					entityIndex: 0,
					options: [
						{ feature_id: TestFeature.Messages, quantity: proQuantity },
					],
				}),
				s.billing.attach({
					productId: pro.id,
					entityIndex: 1,
					options: [
						{ feature_id: TestFeature.Messages, quantity: proQuantity },
					],
				}),
				s.advanceToNextInvoice(),
			],
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
			active: [pro.id],
			notPresent: [premium.id],
		});
		await expectCustomerProducts({
			customer: entity2,
			active: [pro.id],
			notPresent: [premium.id],
		});

		expectCustomerFeatureCorrect({
			customer: entity1,
			featureId: TestFeature.Messages,
			balance: proQuantity,
			usage: 0,
		});
		expectCustomerFeatureCorrect({
			customer: entity2,
			featureId: TestFeature.Messages,
			balance: proQuantity,
			usage: 0,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 3,
			latestTotal: 2 * (PRO_BASE + prepaidCost(proQuantity)),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-entities-prepaid 4: entity 1 pro→free, entity 2 pro→premium, advance cycle")}`,
	async () => {
		const customerId = "sched-prepaid-ent-cross";
		const proQuantity = 300;
		const freeQuantity = 200;
		const premiumQuantity = 500;

		const prepaidItem = items.prepaidMessages({
			includedUsage: INCLUDED_USAGE,
			billingUnits: BILLING_UNITS,
			price: PRICE_PER_UNIT,
		});

		const free = products.base({
			id: "free-prepaid",
			items: [prepaidItem],
		});
		const pro = products.pro({
			id: "pro-prepaid",
			items: [prepaidItem],
		});
		const premium = products.premium({
			id: "premium-prepaid",
			items: [prepaidItem],
		});

		const { autumnV1, entities, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					entityIndex: 0,
					options: [
						{ feature_id: TestFeature.Messages, quantity: proQuantity },
					],
				}),
				s.billing.attach({
					productId: pro.id,
					entityIndex: 1,
					options: [
						{ feature_id: TestFeature.Messages, quantity: proQuantity },
					],
				}),
			],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
			entity_id: entities[0].id,
			options: [{ feature_id: TestFeature.Messages, quantity: freeQuantity }],
			redirect_mode: "if_required",
		});
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[1].id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: premiumQuantity },
			],
			redirect_mode: "if_required",
		});

		const preCycleEntity1 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		await expectProductCanceling({
			customer: preCycleEntity1,
			productId: pro.id,
		});
		await expectProductScheduled({
			customer: preCycleEntity1,
			productId: free.id,
		});

		const preCycleEntity2 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);
		await expectCustomerProducts({
			customer: preCycleEntity2,
			active: [premium.id],
			notPresent: [pro.id],
		});
		expectCustomerFeatureCorrect({
			customer: preCycleEntity2,
			featureId: TestFeature.Messages,
			balance: premiumQuantity,
			usage: 0,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const postCycleEntity1 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		const postCycleEntity2 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);

		await expectCustomerProducts({
			customer: postCycleEntity1,
			active: [free.id],
			notPresent: [pro.id, premium.id],
		});
		await expectCustomerProducts({
			customer: postCycleEntity2,
			active: [premium.id],
			notPresent: [pro.id, free.id],
		});

		expectCustomerFeatureCorrect({
			customer: postCycleEntity1,
			featureId: TestFeature.Messages,
			balance: freeQuantity,
			usage: 0,
		});
		expectCustomerFeatureCorrect({
			customer: postCycleEntity2,
			featureId: TestFeature.Messages,
			balance: premiumQuantity,
			usage: 0,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerAfter,
			count: 4,
			latestTotal:
				prepaidCost(freeQuantity) + PREMIUM_BASE + prepaidCost(premiumQuantity),
		});
	},
);
