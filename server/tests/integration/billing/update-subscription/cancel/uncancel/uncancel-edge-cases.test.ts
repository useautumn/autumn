import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

test.concurrent(`${chalk.yellowBright("uncancel + version upgrade")}`, async () => {
	const customerId = "uncancel-version-upgrade";
	const messagesItemV1 = items.monthlyMessages({ includedUsage: 100 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

	const pro = products.pro({ items: [messagesItemV1] });
	const free = constructProduct({
		id: "free",
		items: [freeMessagesItem],
		type: "free",
		isDefault: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
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

	const messagesItemV2 = items.monthlyMessages({ includedUsage: 200 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItemV2],
	});

	await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
		version: 2,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
		version: 2,
	});

	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUpdate,
		productId: pro.id,
	});

	await expectProductNotPresent({
		customer: customerAfterUpdate,
		productId: free.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterUpdate,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("uncancel + add trial")}`, async () => {
	const customerId = "uncancel-add-trial";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

	const pro = products.pro({ items: [messagesItem] });
	const free = constructProduct({
		id: "free",
		items: [freeMessagesItem],
		type: "free",
		isDefault: true,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductNotTrialing({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	const trialDays = 14;
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
		free_trial: {
			length: trialDays,
			duration: FreeTrialDuration.Day,
			card_required: true,
		},
	});

	expect(preview.total).toBeLessThan(0);

	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(trialDays),
		total: 20,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
		free_trial: {
			length: trialDays,
			duration: FreeTrialDuration.Day,
			card_required: true,
		},
	});

	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUpdate,
		productId: pro.id,
	});
	await expectProductTrialing({
		customer: customerAfterUpdate,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(trialDays),
	});

	await expectProductNotPresent({
		customer: customerAfterUpdate,
		productId: free.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

test.concurrent(`${chalk.yellowBright("remove trial while canceling: cancel preserved")}`, async () => {
	const customerId = "remove-trial-while-cancel";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

	const pro = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});
	const free = constructProduct({
		id: "free",
		items: [freeMessagesItem],
		type: "free",
		isDefault: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductTrialing({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		free_trial: null,
	});

	expect(preview.total).toBeGreaterThan(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		free_trial: null,
	});

	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterUpdate,
		productId: pro.id,
	});
	await expectProductNotTrialing({
		customer: customerAfterUpdate,
		productId: pro.id,
	});

	await expectProductScheduled({
		customer: customerAfterUpdate,
		productId: free.id,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterUpdate,
		count: 2,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});
});

test.concurrent(`${chalk.yellowBright("uncancel during downgrade")}`, async () => {
	const customerId = "uncancel-downgrade";
	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });

	const premium = constructProduct({
		id: "premium",
		items: [premiumMessagesItem],
		type: "premium",
		isDefault: false,
	});

	const pro = products.pro({ items: [proMessagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
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

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premium.id,
		cancel_action: "uncancel",
	});

	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: premium.id,
	});
	await expectProductNotPresent({
		customer: customerAfterUncancel,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterUncancel,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

test.concurrent(`${chalk.yellowBright("uncancel + items + invoice mode")}`, async () => {
	const customerId = "uncancel-invoice-mode";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

	const pro = products.pro({ items: [messagesItem] });
	const free = constructProduct({
		id: "free",
		items: [freeMessagesItem],
		type: "free",
		isDefault: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
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

	const customMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const customPriceItem = items.monthlyPrice({ price: 40 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
		items: [customMessagesItem, customPriceItem],
		invoice: true,
		finalize_invoice: true,
		enable_product_immediately: true,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(20);

	const updateResult = await autumnV1.subscriptions.update(updateParams);

	expect(updateResult.invoice).toBeDefined();
	expect(updateResult.invoice?.status).toBe("open");

	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUpdate,
		productId: pro.id,
	});

	await expectProductNotPresent({
		customer: customerAfterUpdate,
		productId: free.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterUpdate,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterUpdate,
		count: 2,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});
