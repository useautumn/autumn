/**
 * Carry Over Balances — Error Cases
 *
 * carry_over_balances.feature_ids validation:
 * - Boolean features don't have consumable balances → InvalidRequest
 * - Allocated (continuous_use) features don't have consumable balances → InvalidRequest
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
// TEST 1: Boolean feature in feature_ids → error
//
// Pro with boolean dashboard feature
// Attach Premium with carry_over_balances: { enabled: true, feature_ids: ["dashboard"] }
// Expected: InvalidRequest — boolean features have no consumable balance
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("carry-over-balance-errors 1: boolean feature in feature_ids returns InvalidRequest")}`, async () => {
	const proItems = [
		items.monthlyMessages({ includedUsage: 100 }),
		items.dashboard(),
	];
	const premiumItems = [
		items.monthlyMessages({ includedUsage: 500 }),
		items.dashboard(),
	];

	const pro = products.pro({ id: "pro", items: proItems });
	const premium = products.premium({ id: "premium", items: premiumItems });

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "carry-over-err-boolean",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV2_1.billing.attach({
				customer_id: customerId,
				plan_id: premium.id,
				carry_over_balances: {
					enabled: true,
					feature_ids: [TestFeature.Dashboard],
				},
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Allocated feature in feature_ids → error
//
// Pro with allocated seats (prorated billing)
// Attach Premium with carry_over_balances: { enabled: true, feature_ids: ["users"] }
// Expected: InvalidRequest — allocated features have no consumable balance
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("carry-over-balance-errors 2: allocated feature in feature_ids returns InvalidRequest")}`, async () => {
	const proItems = [
		items.monthlyMessages({ includedUsage: 100 }),
		items.allocatedUsers({ includedUsage: 5 }),
	];
	const premiumItems = [
		items.monthlyMessages({ includedUsage: 500 }),
		items.allocatedUsers({ includedUsage: 10 }),
	];

	const pro = products.pro({ id: "pro", items: proItems });
	const premium = products.premium({ id: "premium", items: premiumItems });

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "carry-over-err-allocated",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV2_1.billing.attach({
				customer_id: customerId,
				plan_id: premium.id,
				carry_over_balances: {
					enabled: true,
					feature_ids: [TestFeature.Users],
				},
			});
		},
	});
});
