import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

test.concurrent(`${chalk.yellowBright("update while canceling")}`, async () => {
	const customerId = "upd-while-canceling";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = constructProduct({
		id: "free",
		items: [messagesItem],
		type: "free",
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.attach({ productId: "pro" }),
			s.cancel({ productId: "pro" }),
		],
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const newPriceItem = items.monthlyPrice({ price: 30 });

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		items: [updatedMessagesItem, newPriceItem],
	});

	console.log("Preview total (update while canceling):", preview.total);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		items: [updatedMessagesItem, newPriceItem],
	});

	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterUpdate,
		productId: pro.id,
	});

	await expectProductScheduled({
		customer: customerAfterUpdate,
		productId: free.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterUpdate,
		count: 2,
		latestTotal: preview.total,
	});
});

test.concurrent(`${chalk.yellowBright("update while downgrading")}`, async () => {
	const customerId = "upd-while-downgrading";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	const premium = constructProduct({
		id: "premium",
		items: [consumableItem],
		type: "premium",
		isDefault: false,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [s.attach({ productId: "premium" })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: premium.id,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterDowngrade,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerAfterDowngrade,
		productId: pro.id,
	});

	const updatedConsumableItem = items.consumableMessages({
		includedUsage: 100,
	});
	const newPriceItem = items.monthlyPrice({ price: 60 });

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: premium.id,
		items: [updatedConsumableItem, newPriceItem],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premium.id,
		items: [updatedConsumableItem, newPriceItem],
	});

	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterUpdate,
		productId: premium.id,
	});

	await expectProductScheduled({
		customer: customerAfterUpdate,
		productId: pro.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterUpdate,
		count: 2,
		latestTotal: preview.total,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfterAdvance,
		productId: pro.id,
	});

	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: premium.id,
	});
});

test.concurrent(`${chalk.yellowBright("update while canceling: preserves usage")}`, async () => {
	const customerId = "upd-while-cancel-usage";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = constructProduct({
		id: "free",
		items: [messagesItem],
		type: "free",
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const messagesUsage = 50;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const customerWithUsage =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerWithUsage.features[TestFeature.Messages].usage).toBe(
		messagesUsage,
	);

	await autumnV1.cancel({
		customer_id: customerId,
		product_id: pro.id,
	});

	const customerAfterCancel2 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel2,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel2,
		productId: free.id,
	});

	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		items: [updatedMessagesItem, items.monthlyPrice()],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		items: [updatedMessagesItem, items.monthlyPrice()],
	});

	const customerAfterUpdate2 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterUpdate2,
		productId: pro.id,
	});

	await expectProductScheduled({
		customer: customerAfterUpdate2,
		productId: free.id,
	});

	expect(customerAfterUpdate2.features[TestFeature.Messages].usage).toBe(
		messagesUsage,
	);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});
});
