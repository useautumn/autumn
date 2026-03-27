import { test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
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

const INCLUDED_USAGE = 100;
const VOLUME_TIERS = [
	{ to: 500, amount: 0, flat_amount: 0 },
	{ to: "inf" as const, amount: 0, flat_amount: 50 },
];

test.concurrent(`${chalk.yellowBright("scheduled-switch-entities-edge 1: volume prepaid downgrade keeps inline schedule items")}`, async () => {
	const customerId = "sched-prepaid-ent-volume-inline";
	const premiumQuantity = 600;
	const proQuantity = 300;

	const volumePrepaidItem = items.volumePrepaidMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: 1,
		tiers: VOLUME_TIERS,
	});

	const premium = products.premium({
		id: "premium-volume-prepaid",
		items: [volumePrepaidItem],
	});
	const pro = products.pro({
		id: "pro-volume-prepaid",
		items: [volumePrepaidItem],
	});

	const { autumnV1, entities, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: premiumQuantity },
				],
			}),
		],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: proQuantity }],
		redirect_mode: "if_required",
	});

	const entityBeforeCycle = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entityBeforeCycle,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entityBeforeCycle,
		productId: pro.id,
	});
	expectCustomerFeatureCorrect({
		customer: entityBeforeCycle,
		featureId: TestFeature.Messages,
		balance: premiumQuantity,
		usage: 0,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const entityAfterCycle = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectCustomerProducts({
		customer: entityAfterCycle,
		active: [pro.id],
		notPresent: [premium.id],
	});
	expectCustomerFeatureCorrect({
		customer: entityAfterCycle,
		featureId: TestFeature.Messages,
		balance: proQuantity,
		usage: 0,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
