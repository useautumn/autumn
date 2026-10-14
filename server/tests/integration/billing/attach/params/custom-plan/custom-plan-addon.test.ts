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
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";
import { timeout } from "@/utils/genUtils";

test.concurrent(`${chalk.yellowBright("custom-plan-addon 1: free addon becomes paid")}`, async () => {
	const customerId = "custom-plan-addon-free-to-paid";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const addon = products.base({
		id: "addon",
		items: [wordsItem],
		isAddOn: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerBefore, productId: pro.id });

	const addonPrice = items.monthlyPrice({ price: 10 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: addon.id,
		items: [wordsItem, addonPrice],
	});

	expect(preview.total).toBe(10);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: addon.id,
		items: [wordsItem, addonPrice],
		redirect_mode: "if_required",
	});

	await timeout(2000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 10,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("custom-plan-addon 2: paid addon becomes free")}`, async () => {
	const customerId = "custom-plan-addon-paid-to-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const addon = products.recurringAddOn({ id: "addon", items: [wordsItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerBefore, productId: pro.id });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: addon.id,
		items: [wordsItem],
	});

	expect(preview.total).toBe(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: addon.id,
		items: [wordsItem],
		redirect_mode: "if_required",
	});

	await timeout(2000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("custom-plan-addon 3: recurring addon to one-off")}`, async () => {
	const customerId = "custom-plan-addon-recurring-to-oneoff";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const addon = products.recurringAddOn({ id: "addon", items: [wordsItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const oneOffPrice = constructPriceItem({ price: 50, interval: null });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: addon.id,
		items: [wordsItem, oneOffPrice],
	});

	expect(preview.total).toBe(50);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: addon.id,
		items: [wordsItem, oneOffPrice],
		redirect_mode: "if_required",
	});

	await timeout(2000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 50,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("custom-plan-addon 4: change addon feature quantity")}`, async () => {
	const customerId = "custom-plan-addon-change-quantity";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const addon = products.recurringAddOn({ id: "addon", items: [wordsItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const moreWordsItem = items.monthlyWords({ includedUsage: 500 });
	const addonPrice = items.monthlyPrice({ price: 20 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: addon.id,
		items: [moreWordsItem, addonPrice],
	});

	expect(preview.total).toBe(20);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: addon.id,
		items: [moreWordsItem, addonPrice],
		redirect_mode: "if_required",
	});

	await timeout(2000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
