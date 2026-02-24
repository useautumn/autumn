/**
 * Legacy Attach Response Format Tests
 *
 * Migrated from:
 * - server/tests/attach/response/attach-response1.test.ts (new, no card → checkout_url)
 * - server/tests/attach/response/attach-response2.test.ts (upgrade response)
 * - server/tests/attach/response/attach-response3.test.ts (downgrade response)
 * - server/tests/attach/response/attach-response4.test.ts (new, card on file)
 * - server/tests/attach/response/attach-response5.test.ts (one-off, card on file)
 *
 * Tests that attach responses have the correct shape for v0.2 and v1.2 API versions
 * across different attach scenarios (new, upgrade, downgrade, one-off).
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: New attach with no card on file → returns checkout_url
// (from attach-response1)
//
// Scenario:
// - Pro product ($20/month) with consumable Words (1000 included)
// - Customer with NO payment method
// - v0.2: attach returns only { checkout_url }
// - v1.2: attach returns { customer_id, product_ids, checkout_url, code, message }
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("attach-response 1: new attach, no card → checkout_url")}`, async () => {
	const customerId = "attach-response-1";

	const pro = products.pro({
		id: "pro",
		items: [items.consumableWords({ includedUsage: 1000 })],
	});

	await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	// v0.2 response: only checkout_url
	const v0Response = await autumnV0.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(v0Response.checkout_url).toBeDefined();
	expect(Object.keys(v0Response)).toEqual(["checkout_url"]);

	// v1.2 response: richer object
	const v1Response = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(v1Response).toMatchObject({
		customer_id: customerId,
		product_ids: [pro.id],
		checkout_url: expect.any(String),
	});
	expect(v1Response.code).toBeDefined();
	expect(v1Response.message).toBeDefined();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade response
// (from attach-response2)
//
// Scenario:
// - Pro ($20/month) and Premium ($50/month) with Words (1000 included)
// - Customer with payment method, attach Pro first
// - Upgrade to Premium
// - v0.2: returns { success, message }
// - v1.2: cancel Premium, re-attach Pro, then upgrade to Premium →
//         returns { customer_id, product_ids, code, message }
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("attach-response 2: upgrade response")}`, async () => {
	const customerId1 = "attach-response-2-1";
	const customerId2 = "attach-response-2-2";

	const wordsItem = items.monthlyWords({ includedUsage: 1000 });
	const pro = products.pro({ id: "pro", items: [wordsItem] });
	const premium = products.premium({ id: "premium", items: [wordsItem] });

	const { autumnV1 } = await initScenario({
		customerId: customerId1,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
			s.otherCustomers([{ id: customerId2, paymentMethod: "success" }]),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });

	// v0.2 upgrade response
	const v0Response = await autumnV0.attach({
		customer_id: customerId1,
		product_id: premium.id,
	});

	expect(Object.keys(v0Response)).toEqual(["success", "message"]);

	await autumnV1.attach({
		customer_id: customerId2,
		product_id: pro.id,
	});

	// v1.2 upgrade response
	const v1Response = await autumnV1.attach({
		customer_id: customerId2,
		product_id: premium.id,
	});

	expect(v1Response).toMatchObject({
		customer_id: customerId2,
		product_ids: [premium.id],
		code: expect.any(String),
		message: expect.any(String),
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Downgrade response
// (from attach-response3)
//
// Scenario:
// - Pro ($20/month) and Premium ($50/month) with Words (1000 included)
// - Customer with payment method, attach Premium first
// - Downgrade to Pro
// - v0.2: returns { success, message }
// - v1.2: uncancel Premium, then downgrade to Pro →
//         returns { customer_id, product_ids, code, message }
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("attach-response 3: downgrade response")}`, async () => {
	const customerId = "attach-response-3";

	const wordsItem = items.monthlyWords({ includedUsage: 1000 });
	const pro = products.pro({ id: "pro", items: [wordsItem] });
	const premium = products.premium({ id: "premium", items: [wordsItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });

	// v0.2 downgrade response
	const v0Response = await autumnV0.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(Object.keys(v0Response)).toEqual(["success", "message"]);

	// Reset: uncancel Premium for v1.2 test
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premium.id,
		cancel_action: "uncancel",
	});

	// v1.2 downgrade response
	const v1Response = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(v1Response).toMatchObject({
		customer_id: customerId,
		product_ids: [pro.id],
		code: expect.any(String),
		message: expect.any(String),
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: New attach with card on file → immediate success
// (from attach-response4)
//
// Scenario:
// - Pro ($20/month) with Words (1000 included)
// - Customer with payment method
// - v0.2: attach returns { success, message }
// - v1.2: cancel Pro, re-attach →
//         returns { customer_id, product_ids, code, message }
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("attach-response 4: new attach, card on file")}`, async () => {
	const customerId = "attach-response-4";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyWords({ includedUsage: 1000 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });

	// v0.2 response
	const v0Response = await autumnV0.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(Object.keys(v0Response)).toEqual(["success", "message"]);

	// Reset: cancel Pro for v1.2 test
	await autumnV1.cancel({
		customer_id: customerId,
		product_id: pro.id,
		cancel_immediately: true,
	});

	// v1.2 response
	const v1Response = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(v1Response).toMatchObject({
		customer_id: customerId,
		product_ids: [pro.id],
		code: expect.any(String),
		message: expect.any(String),
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: One-off attach with card on file
// (from attach-response5)
//
// Scenario:
// - One-off product ($10) with lifetime Words (1000 included)
// - Customer with payment method
// - v0.2: attach returns { success, message }
// - v1.2: attach again (one-off can be attached multiple times) →
//         returns { success, customer_id, product_ids, code, message }
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("attach-response 5: one-off attach, card on file")}`, async () => {
	const customerId = "attach-response-5";

	const oneOff = products.oneOff({
		id: "one-off",
		items: [items.lifetimeMessages({ includedUsage: 1000 })],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	// v0.2 response
	const v0Response = await autumnV0.attach({
		customer_id: customerId,
		product_id: oneOff.id,
	});

	expect(v0Response).toMatchObject({
		success: true,
		message: expect.any(String),
	});

	// v1.2 response (attach again — one-off can accumulate)
	const v1Response = await autumnV1.attach({
		customer_id: customerId,
		product_id: oneOff.id,
	});

	expect(v1Response).toMatchObject({
		success: true,
		customer_id: customerId,
		product_ids: [oneOff.id],
		code: expect.any(String),
		message: expect.any(String),
	});
});
