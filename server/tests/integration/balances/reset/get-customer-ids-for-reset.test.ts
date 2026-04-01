import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";

// ─────────────────────────────────────────────────────────────────
// getCustomerIdsForReset — lightweight cron scheduler query
// ─────────────────────────────────────────────────────────────────

const PREFIX = "cron-reset-query";

test.concurrent(`${chalk.yellowBright("getCustomerIdsForReset: returns only customers with expired next_reset_at")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const staleId = `${PREFIX}-stale`;
	const freshId = `${PREFIX}-fresh`;

	const { autumnV1, ctx } = await initScenario({
		customerId: staleId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.otherCustomers([{ id: freshId }]),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: pro.id, customerId: freshId }),
		],
	});

	// Track usage on both so they have active entitlements
	await Promise.all([
		autumnV1.track({
			customer_id: staleId,
			feature_id: TestFeature.Messages,
			value: 10,
		}),
		autumnV1.track({
			customer_id: freshId,
			feature_id: TestFeature.Messages,
			value: 20,
		}),
	]);
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Expire only the stale customer's entitlement
	await expireCusEntForReset({
		ctx,
		customerId: staleId,
		featureId: TestFeature.Messages,
	});

	const results = await CusEntService.getCustomerIdsForReset({
		db: ctx.db,
	});

	// Stale customer should appear
	const staleResult = results.find((r) => r.customerId === staleId);
	expect(staleResult).toBeDefined();
	expect(staleResult!.orgId).toBe(ctx.org.id);
	expect(staleResult!.env).toBe(ctx.env);

	// Fresh customer should NOT appear
	const freshResult = results.find((r) => r.customerId === freshId);
	expect(freshResult).toBeUndefined();
}, 60_000);

test.concurrent(`${chalk.yellowBright("getCustomerIdsForReset: returns unique customers even with multiple expired entitlements")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const wordsItem = items.monthlyWords({ includedUsage: 50 });
	const pro = products.pro({ items: [messagesItem, wordsItem] });

	const customerId = `${PREFIX}-multi-ent`;

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await Promise.all([
		autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		}),
		autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: 5,
		}),
	]);
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Expire both entitlements
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Words,
	});

	const results = await CusEntService.getCustomerIdsForReset({
		db: ctx.db,
	});

	// Should appear exactly once despite two expired entitlements
	const matches = results.filter((r) => r.customerId === customerId);
	expect(matches.length).toBe(1);
}, 60_000);

test.concurrent(`${chalk.yellowBright("getCustomerIdsForReset: respects limit parameter")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const customerId = `${PREFIX}-limit`;

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 10,
	});
	await new Promise((resolve) => setTimeout(resolve, 2000));

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	const results = await CusEntService.getCustomerIdsForReset({
		db: ctx.db,
		limit: 1,
	});

	expect(results.length).toBe(1);
}, 60_000);
