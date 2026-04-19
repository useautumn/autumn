/**
 * Checkout Session Lock — Replacement & Completion Tests
 *
 * Tests for entity/product replacement flows and lock clearing on completion.
 *
 * D. Entity checkout replacement (entity 1 → entity 2)
 * E. Product checkout replacement (pro → premium)
 * F. Non-checkout attach blocked even for different entity
 * G. Lock clears after checkout completion — upgrade succeeds
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, type ApiEntityV0, ErrCode } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST D: Entity checkout replacement
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("checkout-lock D: entity checkout replacement")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-entity",
		items: [messagesItem],
	});

	const { customerId, autumnV1, entities } = await initScenario({
		customerId: "checkout-lock-entity-replace",
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	const result1 = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity1Id,
	});

	expect(result1.payment_url).toBeDefined();

	const result2 = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity2Id,
	});

	expect(result2.payment_url).toBeDefined();
	expect(result2.payment_url).not.toBe(result1.payment_url);

	await completeStripeCheckoutForm({ url: result2.payment_url });
	await timeout(12000);

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({ customer: entity2, productId: pro.id });

	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	expect(entity1.products?.length ?? 0).toBe(0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST E: Product checkout replacement (pro → premium)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("checkout-lock E: product checkout replacement")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "checkout-lock-product-replace",
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	const result1 = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(result1.payment_url).toBeDefined();

	const result2 = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	expect(result2.payment_url).toBeDefined();
	expect(result2.payment_url).not.toBe(result1.payment_url);

	await completeStripeCheckoutForm({ url: result2.payment_url });
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: premium.id });
	await expectProductNotPresent({ customer, productId: pro.id });

	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 50,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST F: Non-checkout attach blocked even for different entity
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("checkout-lock F: non-checkout blocked even for different entity")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-entity-iso",
		items: [messagesItem],
	});

	const { customerId, autumnV1, entities } = await initScenario({
		customerId: "checkout-lock-entity-iso",
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	const result1 = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity1Id,
		redirect_mode: "always",
	});

	expect(result1.payment_url).toBeDefined();

	await expectAutumnError({
		errCode: ErrCode.LockAlreadyExists,
		func: () =>
			autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				entity_id: entity2Id,
				redirect_mode: "if_required",
			}),
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST G: Lock clears after checkout completion — upgrade succeeds
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("checkout-lock G: lock clears after checkout completion")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({
		id: "premium",
		items: [messagesItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "checkout-lock-clears-on-complete",
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(result.payment_url).toBeDefined();

	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });

	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	expect(upgradeResult.payment_url).toBeFalsy();
	await timeout(5000);

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: premium.id });
	await expectProductNotPresent({ customer, productId: pro.id });

	expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 30,
	});
});
