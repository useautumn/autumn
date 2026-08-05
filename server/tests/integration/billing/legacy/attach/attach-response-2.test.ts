/**
 * Legacy Attach Response Format Tests (slice 2 of 2)
 *
 * Migrated from:
 * - server/tests/attach/response/attach-response3.test.ts (downgrade response)
 * - server/tests/attach/response/attach-response4.test.ts (new, card on file)
 *
 * Tests that attach responses have the correct shape for v0.2 and v1.2 API versions
 * across different attach scenarios (downgrade, new with card on file).
 */

import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli";

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

test.concurrent(
	`${chalk.yellowBright("attach-response 3: downgrade response")}`,
	async () => {
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
	},
);

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

test.concurrent(
	`${chalk.yellowBright("attach-response 4: new attach, card on file")}`,
	async () => {
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
	},
);
