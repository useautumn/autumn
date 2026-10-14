import { expect, test } from "bun:test";

import { OnDecrease, OnIncrease, type TrackResponseV2 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectFeatureCachedAndDb } from "@tests/integration/billing/utils/expectFeatureCachedAndDb.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";

const PRICE_PER_SEAT = 50;
const INCLUDED_USAGE = 1;

const userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: PRICE_PER_SEAT,
	includedUsage: INCLUDED_USAGE,
	config: {
		on_increase: OnIncrease.BillImmediately,
		on_decrease: OnDecrease.None,
	},
});

test(`${chalk.yellowBright("allocated-invoice-adv1: tracking overage does not undo add-on cancellation")}`, async () => {
	const pro = products.pro({ id: "pro", items: [userItem] });
	const addOn = products.recurringAddOn({ id: "addon", items: [] });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "allocated-invoice-adv1",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addOn.id }),
			s.cancel({ productId: addOn.id }),
		],
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});

	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	expect(trackRes.balance).toMatchObject({
		granted_balance: 1,
		purchased_balance: 1,
		current_balance: 0,
		usage: 2,
	});

	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		balance: -1,
		usage: 2,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: PRICE_PER_SEAT * 1,
		latestStatus: "paid",
	});

	const customerAfter = await autumnV1.customers.get(customerId);

	await expectCustomerProducts({
		customer: customerAfter,
		active: [pro.id],
		canceling: [addOn.id],
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});

test(`${chalk.yellowBright("allocated-invoice-adv2: tracking entity overage does not undo another entity's scheduled downgrade")}`, async () => {
	const workflowItem = constructArrearProratedItem({
		featureId: TestFeature.Workflows,
		pricePerUnit: PRICE_PER_SEAT,
		includedUsage: INCLUDED_USAGE,
		config: {
			on_increase: OnIncrease.BillImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const premium = products.premium({
		id: "premium",
		items: [workflowItem],
	});
	const pro = products.pro({ id: "pro", items: [workflowItem] });

	const { customerId, autumnV1, autumnV2, entities } = await initScenario({
		customerId: "allocated-invoice-adv2",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, entityIndex: 0 }),
			s.billing.attach({ productId: premium.id, entityIndex: 1 }),
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
		],
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});

	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Workflows,
		entity_id: entities[1].id,
		value: 2,
	});

	expect(trackRes.balance).toMatchObject({
		granted_balance: 1,
		purchased_balance: 1,
		current_balance: 0,
		usage: 2,
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);

	await expectCustomerProducts({
		customer: entity1,
		canceling: [premium.id],
		scheduled: [pro.id],
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});
