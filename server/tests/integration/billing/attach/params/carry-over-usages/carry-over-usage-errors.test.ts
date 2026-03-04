/**
 * Carry Over Usages — Error Cases
 *
 * carry_over_usages validation:
 * - Scheduled/downgrade switches are blocked → InvalidRequest
 * - Allocated (continuous_use) features in feature_ids are blocked → InvalidRequest
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
// TEST 1: Downgrade with carry_over_usages is blocked
//
// Premium: 500 messages, 100 used (balance=400)
// Downgrade to Pro (100) with carry_over_usages: { enabled: true }
// Expected: InvalidRequest — carry_over_usages only supports immediate upgrades
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("carry-over-usage-errors 1: carry_over_usages on scheduled downgrade returns InvalidRequest")}`, async () => {
	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
	const proMessages = items.monthlyMessages({ includedUsage: 100 });

	const premium = products.premium({ id: "premium", items: [premiumMessages] });
	const pro = products.pro({ id: "pro", items: [proMessages] });

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "carry-over-usage-err-downgrade",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [s.attach({ productId: premium.id, timeout: 4000 })],
	});

	// Track some usage so there's something to (not) carry
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Downgrade with carry_over_usages — should be rejected
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV2_1.billing.attach({
				customer_id: customerId,
				plan_id: pro.id,
				carry_over_usages: { enabled: true },
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Allocated feature in feature_ids → error
//
// Pro with allocated seats (prorated billing)
// Attach Premium with carry_over_usages: { enabled: true, feature_ids: ["users"] }
// Expected: InvalidRequest — allocated features have no consumable usage to carry
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("carry-over-usage-errors 2: allocated feature in feature_ids returns InvalidRequest")}`, async () => {
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
		customerId: "carry-over-usage-err-allocated",
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
				carry_over_usages: {
					enabled: true,
					feature_ids: [TestFeature.Users],
				},
			});
		},
	});
});
