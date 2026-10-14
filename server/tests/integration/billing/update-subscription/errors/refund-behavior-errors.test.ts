import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// INCOMPATIBLE BEHAVIOR COMBINATIONS
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("refund_behavior error: refund_payment_method + next_cycle_only")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "rb-err-incompatible",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const newPriceItem = items.monthlyPrice({ price: 20 });
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				items: [messagesItem, newPriceItem],
				billing_behavior: "none",
				refund_behavior: "refund_payment_method",
			});
		},
	});
});

// POSITIVE INVOICE ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("refund_behavior error: refund_payment_method on upgrade (positive invoice)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "rb-err-positive",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const newPriceItem = items.monthlyPrice({ price: 30 });
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				items: [messagesItem, newPriceItem],
				refund_behavior: "refund_payment_method",
			});
		},
	});
});

test.skip(`${chalk.yellowBright("refund_behavior error: refund_payment_method on quantity increase (positive invoice)")}`, async () => {
	const billingUnits = 1;
	const pricePerUnit = 10;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});
	const pro = products.base({ id: "pro", items: [prepaidItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "rb-err-qty-increase",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
			}),
		],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
				refund_behavior: "refund_payment_method",
			});
		},
	});
});

// ZERO-CHANGE SCENARIO
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("refund_behavior error: refund_payment_method with zero invoice total")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "rb-err-zero-total",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				items: [messagesItem, priceItem],
				refund_behavior: "refund_payment_method",
			});
		},
	});
});

// FREE PRODUCT SCENARIO
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("refund_behavior error: refund_payment_method on free product (zero total)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const freeProduct = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "rb-err-free-product",
		setup: [s.customer({}), s.products({ list: [freeProduct] })],
		actions: [s.attach({ productId: "free" })],
	});

	const reducedMessagesItem = items.monthlyMessages({ includedUsage: 50 });
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: freeProduct.id,
				items: [reducedMessagesItem],
				refund_behavior: "refund_payment_method",
			});
		},
	});
});

// VALID COMBINATION: grant_invoice_credits + next_cycle_only
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("refund_behavior: grant_invoice_credits with next_cycle_only is allowed")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "rb-valid-credits-deferred",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const newPriceItem = items.monthlyPrice({ price: 20 });
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
		billing_behavior: "none",
		refund_behavior: "grant_invoice_credits",
	});
});
