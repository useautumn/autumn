import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeInvoiceCheckoutV2 } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

test.concurrent(`${chalk.yellowBright("legacy-inv-mode-adv 1: /checkout endpoint new subscription")}`, async () => {
	const customerId = "legacy-inv-mode-adv-1";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const res = await autumnV1.checkout({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
	});

	expect(res.url).toBeDefined();

	await completeInvoiceCheckoutV2({ url: res.url!, ctx, customerId });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
		latestStatus: "paid",
	});
});

test.concurrent(`${chalk.yellowBright("legacy-inv-mode-adv 2: upgrade with enable_product_immediately draft invoice")}`, async () => {
	const customerId = "legacy-inv-mode-adv-2";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 250 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		invoice: true,
		enable_product_immediately: true,
		finalize_invoice: false,
	});

	expect(res.checkout_url).toBeFalsy();

	const customerBefore = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [pro.id],
		notPresent: [premium.id],
	});
	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 2,
		invoiceIndex: 0,
		latestTotal: 30,
		latestStatus: "draft",
	});

	await ctx.stripeCli.invoices.finalizeInvoice(
		customerBefore.invoices![0].stripe_id,
	);

	await expectCustomerProducts({
		autumn: autumnV1,
		customerId,
		settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		active: [premium.id],
		notPresent: [pro.id],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: premium.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 250,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		autumn: autumnV1,
		customerId,
		settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		count: 2,
		invoiceIndex: 0,
		latestTotal: 30,
		latestStatus: "open",
	});
});

test.concurrent(`${chalk.yellowBright("legacy-inv-mode-adv 3: one-off add-on with quantity via /checkout")}`, async () => {
	const customerId = "legacy-inv-mode-adv-3";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const addOnMessagesItem = items.oneOffMessages({
		price: 10,
		billingUnits: 100,
		includedUsage: 0,
	});
	const addOn = products.base({
		id: "addon",
		items: [addOnMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const options = [
		{
			quantity: 200,
			feature_id: TestFeature.Messages,
		},
	];

	const res = await autumnV1.checkout({
		customer_id: customerId,
		product_id: addOn.id,
		invoice: true,
		options,
	});

	expect(res.url).toBeDefined();

	await completeInvoiceCheckoutV2({ url: res.url!, ctx, customerId });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addOn.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 300,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 0,
		latestTotal: 20,
		latestStatus: "paid",
	});
});

test.concurrent(`${chalk.yellowBright("legacy-inv-mode-adv 4: separate subs due to invoice checkout")}`, async () => {
	const customerId = "legacy-inv-mode-adv-4";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const { db, org, env } = ctx;

	for (const entity of entities) {
		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entity.id,
			invoice: true,
		});

		await completeInvoiceCheckoutV2({
			url: res.checkout_url,
			ctx,
			customerId,
		});
	}

	const fullCus = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const cusProducts = fullCus.customer_products;
	const entity1Prod = cusProducts.find((cp) => cp.entity_id === entities[0].id);
	const entity2Prod = cusProducts.find((cp) => cp.entity_id === entities[1].id);

	const entity1SubId = entity1Prod?.subscription_ids?.[0];
	const entity2SubId = entity2Prod?.subscription_ids?.[0];

	expect(entity1SubId).not.toBe(entity2SubId);

	await expectSubToBeCorrect({
		db,
		customerId,
		org,
		env,
		subId: entity1SubId,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[0].id,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
	});

	await expectSubToBeCorrect({
		db,
		customerId,
		org,
		env,
		subId: entity1SubId,
	});

	await expectSubToBeCorrect({
		db,
		customerId,
		org,
		env,
		subId: entity2SubId,
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({ customer: entity1, productId: premium.id });

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({ customer: entity2, productId: premium.id });
});
