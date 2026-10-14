import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("version-errors: invalid version 404")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "version-err-invalid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	await expectAutumnError({
		errCode: ErrCode.ProductNotFound,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				version: 99,
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("version-errors: preview invalid version 404")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "version-err-preview-invalid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	await expectAutumnError({
		errCode: ErrCode.ProductNotFound,
		func: async () => {
			await autumnV1.subscriptions.previewUpdate({
				customer_id: customerId,
				product_id: pro.id,
				version: 99,
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("version-errors: negative version invalid")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "version-err-negative",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	await expectAutumnError({
		errCode: ErrCode.ProductNotFound,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				version: -1,
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("version-errors: non-existent customer")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1 } = await initScenario({
		customerId: "version-err-no-customer",
		setup: [s.products({ list: [pro] })],
		actions: [],
	});

	await expectAutumnError({
		errCode: ErrCode.CustomerNotFound,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: "non-existent-customer-id",
				product_id: pro.id,
				version: 1,
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("version-errors: downgrade v2 to v1 valid")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-err-downgrade",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV2],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 1,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(-10);

	await autumnV1.subscriptions.update(updateParams);

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("version-errors: same version processes normally")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-err-same",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 1,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	await expectCustomerInvoiceCorrect({
		customerId,
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
