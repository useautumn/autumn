import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { ProductItemFeatureType } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

// ═══════════════════════════════════════════════════════════════════
// UPDATE-ALLOCATED1: Update balance on free allocated feature with overage
// Tests ContinuousUse feature type where overage goes to purchased_balance
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-allocated1: update balance on free allocated feature with overage")}`, async () => {
	// Create allocated users item (ContinuousUse type)
	const usersItem = constructFeatureItem({
		featureId: TestFeature.Users,
		includedUsage: 5,
		featureType: ProductItemFeatureType.ContinuousUse,
	});

	const freeProd = products.base({ id: "free", items: [usersItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-allocated1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Initial state: should have balance of 5 users
	const initialCustomer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initialCustomer.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5,
		current_balance: 5,
		purchased_balance: 0,
		usage: 0,
	});

	// Track +8 to make current_balance 0 and purchased_balance 3
	// Track 8 users when we only have 5 allocated
	// Result: granted=5, usage=8, current=0, purchased=3
	const trackRes = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 8,
	});

	expect(trackRes.balance).toMatchObject({
		granted_balance: 5,
		current_balance: 0,
		purchased_balance: 3,
		usage: 8,
	});

	// Verify via customers.get
	const afterTrack = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterTrack.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5,
		current_balance: 0,
		purchased_balance: 3,
		usage: 8,
	});

	// Update current_balance to 2 (positive): purchased_balance should reset to 0
	// NEW BEHAVIOR: granted_balance does NOT change when only current_balance is passed
	// Instead, usage changes to achieve the target current_balance
	// current_balance = granted_balance - usage => usage = granted_balance - current_balance
	// usage = 5 - 2 = 3
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		current_balance: 2,
	});

	const afterUpdate1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterUpdate1.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5, // Unchanged
		current_balance: 2,
		purchased_balance: 0, // Reset since we're no longer in overage
		usage: 3, // 5 - 2 = 3
	});

	// Update current_balance to -5 (negative): should create overage
	// For allocated features, current_balance floors at 0
	// purchased_balance absorbs the overage
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		current_balance: -5,
	});

	const afterUpdate2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	// granted_balance stays at 5, usage = 5 - (-5) = 10
	// But since current_balance floors at 0, purchased_balance = 5
	expect(afterUpdate2.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5, // Unchanged
		current_balance: 0, // Floored at 0
		purchased_balance: 5, // Overage absorbed here
		usage: 10, // 5 + 5 = 10
	});

	// Verify database state matches cache
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customerFromDb.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5,
		current_balance: 0,
		purchased_balance: 5,
		usage: 10,
	});
});
