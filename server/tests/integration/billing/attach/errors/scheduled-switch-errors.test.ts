/**
 * Scheduled Switch Error Tests (Attach V2)
 *
 * Tests for error conditions when attempting scheduled switches (downgrades).
 *
 * Key behaviors:
 * - Scheduled switch with non-zero one-off prepaid quantities is blocked
 * - Scheduled switch to mixed product WITHOUT one-off quantity is allowed (defaults to 0)
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Scheduled switch with explicit one-off prepaid quantity should fail
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo + one-off prepaid messages)
 * - Attempt downgrade to pro ($20/mo + one-off prepaid messages) with quantity: 200
 *
 * Expected Result:
 * - Error thrown: scheduled switch with one-off prepaid quantities not supported
 */
test.concurrent(`${chalk.yellowBright("error: scheduled switch with one-off prepaid quantity")}`, async () => {
	const customerId = "sched-switch-err-oneoff-qty";

	const premiumOneOff = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumOneOff],
	});

	const proOneOff = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proOneOff],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
			}),
		],
	});

	// Attempt scheduled downgrade with explicit one-off prepaid quantity
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				redirect_mode: "if_required",
			});
		},
	});
});
