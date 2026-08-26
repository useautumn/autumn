import { expect, test } from "bun:test";
import {
	type ApiCustomer,
	type ApiCustomerV5,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { executePostgresDeductionV2 } from "@/internal/balances/utils/deductionV2/executePostgresDeductionV2.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js";

// ─────────────────────────────────────────────────────────────────
// Lazy reset with rollovers (DB path) — GET /customers skip_cache
//
// Attach product with rollover config → track some usage → expire
// cusEnt → GET customer (skip_cache) → verify lazy reset created
// a rollover from the unused balance and refreshed the grant.
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lazy reset rollover (DB): creates rollover from unused balance on reset")}`, async () => {
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 400,
		rolloverConfig: {
			max: 500,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "reset-rollover-db",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 250 }),
		],
	});

	await timeout(2000);

	// Before reset: 400 - 250 = 150 remaining
	const before = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(before.balances[TestFeature.Messages].current_balance).toBe(150);
	expect(before.balances[TestFeature.Messages].usage).toBe(250);

	// Expire cusEnt so the next read triggers a lazy reset
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	// GET customer (DB path) should trigger lazy reset:
	// - Unused balance = 150 → rollover = min(150, cap 500) = 150
	// - Fresh grant = 400
	// - Total = 400 + 150 = 550
	const after = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});

	expect(after.balances[TestFeature.Messages].usage).toBe(0);
	expect(after.balances[TestFeature.Messages].current_balance).toBe(550);
	expect(after.balances[TestFeature.Messages].rollovers).toBeDefined();
	expect(after.balances[TestFeature.Messages].rollovers!.length).toBe(1);
	expect(after.balances[TestFeature.Messages].rollovers![0].balance).toBe(150);

	// Verify next_reset_at advanced into the future
	const cusEntAfter = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEntAfter).toBeDefined();
	expect(cusEntAfter!.next_reset_at).toBeGreaterThan(Date.now());
});

// ─────────────────────────────────────────────────────────────────
// Lazy reset with rollovers (cache path) — GET /customers (cached)
//
// Same idea but through the cache path, and with a lower rollover
// cap to verify the cap is respected.
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lazy reset rollover (cache): caps rollover at max and resets via cache")}`, async () => {
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 300,
		rolloverConfig: {
			max: 100,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "reset-rollover-cache",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [free] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Messages, value: 50, timeout: 2000 }),
		],
	});

	// Before reset: 300 - 50 = 250 remaining
	// Warm the cache
	const before = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(before.balances[TestFeature.Messages].current_balance).toBe(250);
	expect(before.balances[TestFeature.Messages].usage).toBe(50);

	// Expire cusEnt so the next read triggers a lazy reset
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	// GET customer (cache path) should trigger lazy reset:
	// - Unused balance = 250, but rollover cap = 100 → rollover = 100
	// - Fresh grant = 300
	// - Total = 300 + 100 = 400
	const after = await autumnV2.customers.get<ApiCustomer>(customerId);

	expect(after.balances[TestFeature.Messages].usage).toBe(0);
	expect(after.balances[TestFeature.Messages].current_balance).toBe(400);
	expect(after.balances[TestFeature.Messages].rollovers).toBeDefined();
	expect(after.balances[TestFeature.Messages].rollovers!.length).toBe(1);
	expect(after.balances[TestFeature.Messages].rollovers![0].balance).toBe(100);

	// Verify next_reset_at advanced into the future
	const cusEntAfter = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEntAfter).toBeDefined();
	expect(cusEntAfter!.next_reset_at).toBeGreaterThan(Date.now());
});

test.concurrent(
	`${chalk.yellowBright("invoice-credit cached renewal: clears prior attribution and rates new-cycle rollover usage from zero")}`,
	async () => {
		const tieredCreditsItem = items.consumable({
			featureId: TestFeature.TieredCredits,
			includedUsage: 1_000,
			price: 1,
			billingUnits: 1,
			rolloverConfig: {
				max: 1_000,
				length: 1,
				duration: RolloverExpiryDurationType.Month,
			},
		});
		const product = products.base({
			id: "invoice-credit-reset-rollover",
			items: [tieredCreditsItem],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "invoice-credit-reset-rollover",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.billing.attach({ productId: product.id }),
				s.track({
					featureId: TestFeature.TieredAction,
					value: 5_000,
					timeout: 2_000,
				}),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});
		const sourceInternalFeatureId = ctx.features.find(
			(feature) => feature.id === TestFeature.TieredAction,
		)?.internal_id;
		expect(sourceInternalFeatureId).toBeDefined();

		const afterReset =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(afterReset.balances[TestFeature.TieredCredits].remaining).toBe(
			1_950,
		);
		const resetCustomerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.TieredCredits,
		});
		expect(resetCustomerEntitlement?.usage_attribution).toEqual({});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			value: 100,
		});
		await timeout(2_000);
		const afterRolloverSpend = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.TieredCredits,
		});
		expect(
			afterRolloverSpend?.usage_attribution?.[sourceInternalFeatureId!],
		).toEqual({
			units: 100,
			credits: 1,
		});
		expect(afterRolloverSpend?.rollovers[0]?.balance).toBe(949);
	},
	{ timeout: 120_000 },
);

test.concurrent(
	`${chalk.yellowBright("invoice-credit rollover: Postgres fallback advances new-cycle attribution atomically")}`,
	async () => {
		const tieredCreditsItem = items.consumable({
			featureId: TestFeature.TieredCredits,
			includedUsage: 1_000,
			price: 1,
			billingUnits: 1,
			rolloverConfig: {
				max: 1_000,
				length: 1,
				duration: RolloverExpiryDurationType.Month,
			},
		});
		const product = products.base({
			id: "invoice-credit-postgres-rollover",
			items: [tieredCreditsItem],
		});
		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "invoice-credit-postgres-rollover",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.billing.attach({ productId: product.id }),
				s.track({
					featureId: TestFeature.TieredAction,
					value: 5_000,
					timeout: 2_000,
				}),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});

		const fullSubject = await getOrSetCachedFullSubject({
			ctx,
			customerId,
			source: "invoice-credit-postgres-rollover-test",
		});
		const sourceFeature = ctx.features.find(
			(feature) => feature.id === TestFeature.TieredAction,
		);
		expect(sourceFeature).toBeDefined();
		await executePostgresDeductionV2({
			ctx,
			fullSubject,
			customerId,
			deductions: [{ feature: sourceFeature!, deduction: 100 }],
		});

		const customerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.TieredCredits,
		});
		expect(
			customerEntitlement?.usage_attribution?.[sourceFeature!.internal_id],
		).toEqual({ units: 100, credits: 1 });
		expect(customerEntitlement?.rollovers[0]?.balance).toBe(949);
	},
	{ timeout: 120_000 },
);
