/**
 * Carry Over Balances — Scheduled / Downgrade Tests
 *
 * carry_over_balances is only valid for immediate upgrades.
 * Attempting to use it on a scheduled downgrade must be rejected.
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Downgrade with carry_over_balances is blocked
//
// Premium: 500 messages, 100 used (balance=400)
// Downgrade to Pro (100) with carry_over_balances: { enabled: true }
// Expected: InvalidRequest error — cannot carry over on a scheduled downgrade
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("carry-over-balance-scheduled 1: carry_over_balances on downgrade returns InvalidRequest error")}`, async () => {
	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
	const proMessages = items.monthlyMessages({ includedUsage: 100 });

	const premium = products.premium({ id: "premium", items: [premiumMessages] });
	const pro = products.pro({ id: "pro", items: [proMessages] });

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "carry-over-balance-downgrade-blocked",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [s.attach({ productId: premium.id, timeout: 4000 })],
	});

	// Track some usage so there's a non-zero balance to (not) carry
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: "messages",
		value: 100,
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Downgrade with carry_over_balances: should be rejected
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV2_1.billing.attach({
				customer_id: customerId,
				plan_id: pro.id,
				carry_over_balances: { enabled: true },
			});
		},
	});
});
