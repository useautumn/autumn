import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// VERSION ERRORS: Error handling for version update edge cases
// ═══════════════════════════════════════════════════════════════════════════════

// 3.1 Invalid version: version 99 doesn't exist
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

	// Try to update to version 99 (doesn't exist)
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

// 3.2 Preview with invalid version also returns 404
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

	// Try to preview with version 99 (doesn't exist)
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

// 3.3 Negative version is invalid
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

	// Try to update to version -1 (invalid)
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

// 3.4 Update version for non-existent customer
test.concurrent(`${chalk.yellowBright("version-errors: non-existent customer")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1 } = await initScenario({
		customerId: "version-err-no-customer",
		setup: [s.products({ list: [pro] })],
		actions: [],
	});

	// Try to update version for customer that doesn't exist
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

// 3.5 Version downgrade (v2 -> v1) is allowed
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

	// Create v2 with higher price
	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV2],
	});

	// Update to v2 first
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	});

	// Now downgrade back to v1
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 1,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should credit $10 difference ($20 - $30)
	expect(preview.total).toBe(-10);

	await autumnV1.subscriptions.update(updateParams);

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3, // Initial + upgrade to v2 + downgrade to v1
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 3.6 Same version update processes normally (no special case)
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

	// Update to version 1 (current version) - processes normally
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 1,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No price change for same version
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	// No second invoice created for same version (no price change)
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
