/**
 * Vercel attach guard
 *
 * Proves that `handleCustomPaymentMethodErrorsV2` blocks normal Autumn API
 * attach attempts against Vercel-managed customers, independent of whether a
 * legacy Stripe Custom Payment Method is configured.
 *
 * The previous implementation had two branches: a (broken) CPM-shape match
 * AND an `installation_id` fallback. The CPM match never fired in practice
 * because `custom_payment_method_id` is a PM instance id (`pm_*`) and
 * `paymentMethod.custom.type` is a CPM type id (`cpmt_*`). The refactor drops
 * the CPM branch — the guard now fires purely on `processors.vercel.installation_id`.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import {
	seedVercelCustomer,
	setupVercelOrg,
} from "./utils/vercel-test-helpers";

const TEST_CASE = "vac";

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: New Vercel onboarder (no CPM stored) — attach blocked
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright(
		"vercel-attach-guard: new Vercel customer (no custom_payment_method_id) is blocked from external attach",
	)}`,
	async () => {
		const customerId = `${TEST_CASE}-no-cpm-customer`;
		const installationId = `icfg_${TEST_CASE}_no_cpm`;

		await setupVercelOrg(ctx);
		await seedVercelCustomer({
			ctx,
			customerId,
			installationId,
			// No customPaymentMethodId — this represents a NEW onboarder under
			// the refactored flow.
		});

		const pro = products.pro({
			id: `${TEST_CASE}-no-cpm-pro`,
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		// Ensure the product exists in the test org. initScenario without
		// `s.customer` would create one; instead we seed products only.
		const { autumnV1 } = await initScenario({
			customerId: `${customerId}-helper`,
			setup: [
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await expect(
			autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
			}),
		).rejects.toThrow(/billed outside of Stripe|origin platform/i);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Legacy Vercel customer (has CPM stored) — still blocked
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright(
		"vercel-attach-guard: legacy Vercel customer (with custom_payment_method_id) is also blocked",
	)}`,
	async () => {
		const customerId = `${TEST_CASE}-legacy-cpm-customer`;
		const installationId = `icfg_${TEST_CASE}_legacy_cpm`;

		await setupVercelOrg(ctx);
		await seedVercelCustomer({
			ctx,
			customerId,
			installationId,
			customPaymentMethodId: "pm_legacy_stub",
		});

		const pro = products.pro({
			id: `${TEST_CASE}-legacy-cpm-pro`,
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const { autumnV1 } = await initScenario({
			customerId: `${customerId}-helper`,
			setup: [
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await expect(
			autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
			}),
		).rejects.toThrow(/billed outside of Stripe|origin platform/i);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Non-Vercel customer — attach proceeds normally
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright(
		"vercel-attach-guard: non-Vercel customer is unaffected and attach succeeds",
	)}`,
	async () => {
		const customerId = `${TEST_CASE}-non-vercel-customer`;
		const pro = products.pro({
			id: `${TEST_CASE}-non-vercel-pro`,
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		// Should not throw.
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const customer = await autumnV1.customers.get(customerId);
		expect(customer.products.map((p: { id: string }) => p.id)).toContain(
			pro.id,
		);
	},
);
