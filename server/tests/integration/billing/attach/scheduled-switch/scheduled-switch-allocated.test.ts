/**
 * Scheduled Switch Allocated Tests (Attach V2)
 *
 * Tests for downgrades involving allocated (seat-based) features.
 *
 * NOTE: These cases have undefined behavior. Tests should throw error "behavior undefined"
 * until we clarify how allocated seats are handled on scheduled downgrade.
 *
 * Open questions:
 * - How are seats handled at cycle end?
 * - How is existing overage handled on downgrade?
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Pro with allocated, under limit, to free
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with 5 allocated users (using 3)
 * - Downgrade to free
 *
 * Expected Result:
 * - Error: "behavior undefined"
 * - TBD: How are seats handled at cycle end?
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-allocated 1: pro with allocated, under limit, to free")}`, async () => {
	const customerId = "sched-switch-alloc-under";

	const allocatedItem = items.allocatedUsers({ includedUsage: 5 });
	const pro = products.pro({
		id: "pro",
		items: [allocatedItem],
	});

	const freeUsers = items.freeUsers({ includedUsage: 2 });
	const free = products.base({
		id: "free",
		items: [freeUsers],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Users, value: 3 }), // Using 3 of 5
		],
	});

	// Verify Stripe subscription after initial attach
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Verify initial state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		balance: 2, // 5 included - 3 used
		usage: 3,
	});

	// Attempt to downgrade to free
	// NOTE: This behavior is undefined - the test documents expected behavior
	// once we implement the handling
	try {
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
			redirect_mode: "if_required",
		});

		// If we get here, the downgrade was accepted
		// Verify the scheduled state
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductCanceling({
			customer,
			productId: pro.id,
		});
		await expectProductScheduled({
			customer,
			productId: free.id,
		});

		// Verify Stripe subscription
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	} catch (error: unknown) {
		// If an error is thrown, verify it's the expected behavior
		const errorMessage = error instanceof Error ? error.message : String(error);
		expect(errorMessage).toContain("behavior undefined");
	}
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Pro with allocated, over limit, to free
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with 5 allocated users (using 7 - over limit)
 * - Downgrade to free
 *
 * Expected Result:
 * - Error: "behavior undefined"
 * - TBD: How is existing overage handled on downgrade?
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-allocated 2: pro with allocated, over limit, to free")}`, async () => {
	const customerId = "sched-switch-alloc-over";

	const allocatedItem = items.allocatedUsers({ includedUsage: 5 });
	const pro = products.pro({
		id: "pro",
		items: [allocatedItem],
	});

	const freeUsers = items.freeUsers({ includedUsage: 2 });
	const free = products.base({
		id: "free",
		items: [freeUsers],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Users, value: 7 }), // Using 7, over 5 limit
		],
	});

	// Verify Stripe subscription after initial attach
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Verify initial state - over limit
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		balance: -2, // 5 included - 7 used = -2 (overage)
		usage: 7,
	});

	// Attempt to downgrade to free
	// NOTE: This behavior is undefined - the test documents expected behavior
	// once we implement the handling
	try {
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
			redirect_mode: "if_required",
		});

		// If we get here, the downgrade was accepted
		// Verify the scheduled state
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductCanceling({
			customer,
			productId: pro.id,
		});
		await expectProductScheduled({
			customer,
			productId: free.id,
		});

		// Verify Stripe subscription
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	} catch (error: unknown) {
		// If an error is thrown, verify it's the expected behavior
		const errorMessage = error instanceof Error ? error.message : String(error);
		expect(errorMessage).toContain("behavior undefined");
	}
});
