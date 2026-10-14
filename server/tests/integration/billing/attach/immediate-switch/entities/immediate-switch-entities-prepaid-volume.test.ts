import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;

const TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

test.concurrent(`${chalk.yellowBright("attach-prepaid-volume-entities: graduated (entity 1) vs volume (entity 2), 800 units same tier, pro → premium")}`, async () => {
	const customerId = "vol-ent-switch-800-same";

	const gradProItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const gradPremiumItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const gradPro = products.pro({
		id: "grad-pro-800",
		items: [gradProItem],
	});
	const gradPremium = products.premium({
		id: "grad-premium-800",
		items: [gradPremiumItem],
	});

	const volProItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const volPremiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const volPro = products.pro({
		id: "vol-pro-800",
		items: [volProItem],
	});
	const volPremium = products.premium({
		id: "vol-premium-800",
		items: [volPremiumItem],
	});

	const quantity = 800;

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [gradPro, gradPremium, volPro, volPremium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: gradPro.id,
				entityIndex: 0,
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
			s.billing.attach({
				productId: volPro.id,
				entityIndex: 1,
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
		],
	});

	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity1Before, productId: gradPro.id });
	expectCustomerFeatureCorrect({
		customer: entity1Before,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({ customer: entity2Before, productId: volPro.id });
	expectCustomerFeatureCorrect({
		customer: entity2Before,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	const previewEnt1 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: gradPremium.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewEnt1.total).toBeGreaterThan(0);

	const previewEnt2 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPremium.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewEnt2.total).toBeGreaterThan(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: gradPremium.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPremium.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectCustomerProducts({
		customer: entity1,
		active: [gradPremium.id],
		notPresent: [gradPro.id],
	});
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
	await expectCustomerProducts({
		customer: entity2,
		active: [volPremium.id],
		notPresent: [volPro.id],
	});
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 4,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("attach-prepaid-volume-entities: graduated ($65) vs volume ($40), 300 → 800 units tier 1 → tier 2")}`, async () => {
	const customerId = "vol-ent-switch-300-800";

	const gradProItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const gradPremiumItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const gradPro = products.pro({
		id: "grad-pro-300-800",
		items: [gradProItem],
	});
	const gradPremium = products.premium({
		id: "grad-premium-300-800",
		items: [gradPremiumItem],
	});

	const volProItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const volPremiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const volPro = products.pro({
		id: "vol-pro-300-800",
		items: [volProItem],
	});
	const volPremium = products.premium({
		id: "vol-premium-300-800",
		items: [volPremiumItem],
	});

	const initQuantity = 300;
	const newQuantity = 800;

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [gradPro, gradPremium, volPro, volPremium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: gradPro.id,
				entityIndex: 0,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
			s.billing.attach({
				productId: volPro.id,
				entityIndex: 1,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	const previewEnt1 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: gradPremium.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(previewEnt1.total).toBeGreaterThan(0);

	const previewEnt2 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPremium.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(previewEnt2.total).toBeGreaterThan(0);

	expect(previewEnt1.total).toBeGreaterThan(previewEnt2.total);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: gradPremium.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
		redirect_mode: "if_required",
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPremium.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
		redirect_mode: "if_required",
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectCustomerProducts({
		customer: entity1,
		active: [gradPremium.id],
		notPresent: [gradPro.id],
	});
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: newQuantity,
		usage: 0,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectCustomerProducts({
		customer: entity2,
		active: [volPremium.id],
		notPresent: [volPro.id],
	});
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: newQuantity,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 4,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
