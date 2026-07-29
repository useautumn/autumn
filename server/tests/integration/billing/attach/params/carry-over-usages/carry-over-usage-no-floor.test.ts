/**
 * TDD contract: carried usage is NOT floored at zero when it exceeds the new
 * plan's included allowance — the balance goes negative instead (e.g. Marketing
 * Pro 25k with 25k used downgraded to Pro 5k lands at -20k/5k). Consistent
 * across attach and sync; usage never changes on a plan transition.
 *
 * Contract under test:
 *   New behaviors:
 *     - allocated (continuous) feature carried by attach's DEFAULT config goes
 *       negative when prior usage exceeds the new allowance
 *     - consumable feature carried via carry_over_usages { enabled: true }
 *       goes negative the same way (no clamp)
 *
 * Pre-impl red: deductFromCusEntsTypescript floors non-usage_allowed balances
 * at 0, so both assertions see balance 0 instead of the negative carry.
 * Post-impl green: the existing-usages carry path allows negative balances.
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const REDIS_SYNC_MS = 2000;

// ═══════════════════════════════════════════════════════════════════════════
// Assertion 1 — allocated feature (default carry): downgrade goes negative
//
// Pro: 25 users (allocated, no price), 25 used. Attach Premium (5 users), no
// carry param — allocated features always carry. Expected: balance -20,
// usage 25. Pre-fix: balance clamped to 0 (usage shown as 5).
// ═══════════════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("carry no-floor 1: allocated usage above new allowance goes negative")}`,
	async () => {
		const pro = products.pro({
			id: "nofloor-alloc-pro",
			items: [items.freeUsers({ includedUsage: 25 })],
		});
		const premium = products.premium({
			id: "nofloor-alloc-premium",
			items: [items.freeUsers({ includedUsage: 5 })],
		});

		const { customerId, autumnV2_1, autumnV1 } = await initScenario({
			customerId: "carry-no-floor-allocated",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: pro.id, timeout: 4000 })],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 25,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		await autumnV2_1.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: 5,
			balance: -20,
			usage: 25,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════
// Assertion 2 — consumable feature with carry enabled: no clamp on downgrade
//
// Pro: 50 messages, 50 used. Attach Premium (30 messages) with
// carry_over_usages { enabled: true }. Expected: balance -20, usage 50.
// Pre-fix: balance clamped to 0.
// ═══════════════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("carry no-floor 2: consumable usage above new allowance goes negative")}`,
	async () => {
		const pro = products.pro({
			id: "nofloor-cons-pro",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});
		const premium = products.premium({
			id: "nofloor-cons-premium",
			items: [items.monthlyMessages({ includedUsage: 30 })],
		});

		const { customerId, autumnV2_1, autumnV1 } = await initScenario({
			customerId: "carry-no-floor-consumable",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: pro.id, timeout: 4000 })],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		await autumnV2_1.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
			carry_over_usages: { enabled: true },
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 30,
			balance: -20,
			usage: 50,
		});
	},
);
