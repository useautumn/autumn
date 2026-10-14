import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";

test.concurrent(`${chalk.yellowBright("custom-plan-structure 1: downgrade becomes upgrade via price increase")}`, async () => {
	const customerId = "custom-plan-downgrade-to-upgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({ id: "pro", items: [messagesItem, proPrice] });
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: premium.id,
	});

	const higherPrice = items.monthlyPrice({ price: 60 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, higherPrice],
	});

	expect(preview.total).toBe(10);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, higherPrice],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
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

test.concurrent(`${chalk.yellowBright("custom-plan-structure 2: upgrade becomes downgrade via price decrease")}`, async () => {
	const customerId = "custom-plan-upgrade-to-downgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({ id: "pro", items: [messagesItem, proPrice] });
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerBefore, productId: pro.id });

	const lowerPrice = items.monthlyPrice({ price: 15 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		items: [messagesItem, lowerPrice],
	});

	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		total: 15,
		startsAt: addMonths(advancedTo, 1).getTime(),
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		items: [messagesItem, lowerPrice],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({ customer, productId: pro.id });
	await expectProductScheduled({
		customer,
		productId: premium.id,
		startsAt: addMonths(advancedTo, 1).getTime(),
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

test.concurrent(`${chalk.yellowBright("custom-plan-structure 3: recurring to one-off")}`, async () => {
	const customerId = "custom-plan-recurring-to-oneoff";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const oneOffPrice = constructPriceItem({ price: 50, interval: null });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, oneOffPrice],
	});

	expect(preview.total).toBe(50);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, oneOffPrice],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 50,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("custom-plan-structure 4: one-off to recurring")}`, async () => {
	const customerId = "custom-plan-oneoff-to-recurring";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const oneOff = products.oneOff({ id: "one-off", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	const monthlyPrice = items.monthlyPrice({ price: 20 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		items: [messagesItem, monthlyPrice],
	});

	expect(preview.total).toBe(20);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		items: [messagesItem, monthlyPrice],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: oneOff.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
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

test.concurrent(`${chalk.yellowBright("custom-plan-structure 5: free to recurring")}`, async () => {
	const customerId = "custom-plan-free-to-recurring";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ id: "free", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [],
	});

	const monthlyPrice = items.monthlyPrice({ price: 20 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, monthlyPrice],
	});

	expect(preview.total).toBe(20);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, monthlyPrice],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: free.id });

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

test.concurrent(`${chalk.yellowBright("custom-plan-structure 6: recurring to free")}`, async () => {
	const customerId = "custom-plan-recurring-to-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem],
	});

	expect(preview.total).toBe(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	await expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("custom-plan-structure 7: monthly to annual on attach")}`, async () => {
	const customerId = "custom-plan-monthly-to-annual";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const monthlyPrice = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, monthlyPrice] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const annualPrice = items.annualPrice({ price: 200 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, annualPrice],
	});

	expect(preview.total).toBe(200);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, annualPrice],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 200,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("custom-plan-structure 8: annual to monthly on attach")}`, async () => {
	const customerId = "custom-plan-annual-to-monthly";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const annualPrice = items.annualPrice({ price: 200 });
	const pro = products.base({ id: "pro", items: [messagesItem, annualPrice] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const monthlyPrice = items.monthlyPrice({ price: 20 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, monthlyPrice],
	});

	expect(preview.total).toBe(20);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, monthlyPrice],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

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
