import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;
const BASE_PRICE = 20;
const TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

test.concurrent(`${chalk.yellowBright("attach-prepaid-volume-entities: graduated ($65) vs volume ($40) at 800 units tier 2")}`, async () => {
	const customerId = "vol-ent-initial-800";
	const quantity = 800;

	const gradExpectedPrepaid = 5 * 10 + 3 * 5;
	const volExpectedPrepaid = (quantity / BILLING_UNITS) * 5;

	const gradItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const volItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	const gradPro = products.pro({ id: "grad-pro-ent-800", items: [gradItem] });
	const volPro = products.pro({ id: "vol-pro-ent-800", items: [volItem] });

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [gradPro, volPro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const previewGrad = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: gradPro.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewGrad.total).toBe(BASE_PRICE + gradExpectedPrepaid);

	const previewVol = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPro.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewVol.total).toBe(BASE_PRICE + volExpectedPrepaid);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: gradPro.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPro.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity1, productId: gradPro.id });
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({ customer: entity2, productId: volPro.id });
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: BASE_PRICE + volExpectedPrepaid,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 1,
		latestTotal: BASE_PRICE + gradExpectedPrepaid,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("attach-prepaid-volume-entities: volume with includedUsage (200 free, every pack at the total's tier)")}`, async () => {
	const customerId = "vol-ent-included-200";
	const includedUsage = 200;
	const quantity1 = 800;
	const quantity2 = 400;

	const purchasedPacks1 = quantity1 / BILLING_UNITS;
	const volExpected1 = purchasedPacks1 * 5;
	const purchasedPacks2 = quantity2 / BILLING_UNITS;
	const volExpected2 = purchasedPacks2 * 10;

	const volItem = items.volumePrepaidMessages({
		includedUsage,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	const volPro = products.pro({ id: "vol-pro-inc-200", items: [volItem] });

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [volPro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const preview1 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPro.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity1 }],
	});
	expect(preview1.total).toBe(BASE_PRICE + volExpected1);

	const preview2 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPro.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity2 }],
	});
	expect(preview2.total).toBe(BASE_PRICE + volExpected2);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPro.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity1 }],
		redirect_mode: "if_required",
	});
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPro.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity2 }],
		redirect_mode: "if_required",
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity1, productId: volPro.id });
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
	await expectProductActive({ customer: entity2, productId: volPro.id });
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
		latestTotal: BASE_PRICE + volExpected2,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 1,
		latestTotal: BASE_PRICE + volExpected1,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
