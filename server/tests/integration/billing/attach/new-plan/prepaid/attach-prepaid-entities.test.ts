import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;
const PRICE_PER_UNIT = 10;
const INCLUDED_USAGE = 100;

test.concurrent(`${chalk.yellowBright("prepaid-entities: attach prepaid messages with included usage to two entities")}`, async () => {
	const customerId = "prepaid-ent-two-included";
	const quantity1 = 300;
	const quantity2 = 500;

	const purchasedUnits1 = (quantity1 - INCLUDED_USAGE) / BILLING_UNITS;
	const purchasedUnits2 = (quantity2 - INCLUDED_USAGE) / BILLING_UNITS;
	const prepaidCost1 = purchasedUnits1 * PRICE_PER_UNIT;
	const prepaidCost2 = purchasedUnits2 * PRICE_PER_UNIT;

	const prepaidItem = items.prepaidMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		price: PRICE_PER_UNIT,
	});

	const base = products.base({
		id: "base-prepaid-ent-inc",
		items: [prepaidItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: base.id,
				entityIndex: 0,
				options: [{ feature_id: TestFeature.Messages, quantity: quantity1 }],
			}),
			s.billing.attach({
				productId: base.id,
				entityIndex: 1,
				options: [{ feature_id: TestFeature.Messages, quantity: quantity2 }],
			}),
		],
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity1, productId: base.id });
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: quantity1,
		usage: 0,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({ customer: entity2, productId: base.id });
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: quantity2,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: prepaidCost2,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 1,
		latestTotal: prepaidCost1,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("prepaid-entities: customer + entity both have same prepaid product")}`, async () => {
	const customerId = "prepaid-ent-with-customer";
	const customerQuantity = 200;
	const entityQuantity = 300;

	const customerPurchasedUnits =
		(customerQuantity - INCLUDED_USAGE) / BILLING_UNITS;
	const entityPurchasedUnits =
		(entityQuantity - INCLUDED_USAGE) / BILLING_UNITS;
	const customerPrepaidCost = customerPurchasedUnits * PRICE_PER_UNIT;
	const entityPrepaidCost = entityPurchasedUnits * PRICE_PER_UNIT;

	const prepaidItem = items.prepaidMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		price: PRICE_PER_UNIT,
	});

	const base = products.base({
		id: "base-prepaid-cus-ent",
		items: [prepaidItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: base.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: customerQuantity },
				],
			}),
			s.billing.attach({
				productId: base.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: entityQuantity },
				],
			}),
		],
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity1, productId: base.id });
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: entityQuantity + customerQuantity,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(
		isBalanceWorkerRoute()
			? customerQuantity
			: customerQuantity + entityQuantity,
	);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: entityPrepaidCost,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 1,
		latestTotal: customerPrepaidCost,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
