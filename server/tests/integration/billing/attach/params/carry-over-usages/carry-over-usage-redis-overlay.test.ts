/**
 * Attach Redis-balance overlay regression.
 *
 * This deliberately bypasses the normal dirty-sync queue so Postgres remains
 * stale while Redis contains an accepted deduction. The attach must carry the
 * live Redis usage into the replacement product.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { executeRedisDeductionV2 } from "@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js";
import {
	getCachedFullSubject,
	getOrSetCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";

test("attach carries Redis-only usage into the replacement product", async () => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 200 })],
	});

	const { customerId, autumnV1, autumnV2_3 } = await initScenario({
		customerId: "carry-over-usage-redis-overlay",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	const oldFullSubject = await getOrSetCachedFullSubject({
		ctx,
		customerId,
		source: "carry-over-usage-redis-overlay",
	});
	const messagesFeature = ctx.features.find(
		(feature) => feature.id === TestFeature.Messages,
	);
	expect(messagesFeature).toBeDefined();

	// Redis A becomes 95. No sync item is queued, so Postgres A stays at 100.
	await executeRedisDeductionV2({
		ctx,
		fullSubject: oldFullSubject,
		deductions: [{ feature: messagesFeature!, deduction: 5 }],
		deductionOptions: { overageBehaviour: "cap" },
	});

	const stalePostgresCustomer = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	expectCustomerFeatureCorrect({
		customer: stalePostgresCustomer,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});

	await autumnV2_3.billing.attach({
		customer_id: customerId,
		plan_id: premium.id,
		carry_over_usages: { enabled: true },
	});
	const { fullSubject: publishedSubject } = await getCachedFullSubject({
		ctx,
		customerId,
		source: "carry-over-usage-redis-overlay:published",
	});
	const publishedTarget = publishedSubject?.customer_products.find(
		(customerProduct) => customerProduct.product.id === premium.id,
	);
	expect(
		publishedTarget?.customer_entitlements.find(
			(customerEntitlement) =>
				customerEntitlement.feature_id === TestFeature.Messages,
		)?.balance,
	).toBe(195);

	// The replacement must be calculated from Redis A=95, not Postgres A=100.
	const afterAttach = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: afterAttach,
		featureId: TestFeature.Messages,
		balance: 195,
		usage: 5,
	});

	const persistedAfterAttach = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	expectCustomerFeatureCorrect({
		customer: persistedAfterAttach,
		featureId: TestFeature.Messages,
		balance: 195,
		usage: 5,
	});
});
