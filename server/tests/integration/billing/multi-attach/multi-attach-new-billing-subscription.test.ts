import { test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

// ═══════════════════════════════════════════════════════════════════
// Test 1: Multi-attach on entity with new_billing_subscription
//   after customer already has a product, mid-cycle
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach new-billing-sub: entity multi-attach creates separate subscription mid-cycle")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const usersItem = items.monthlyUsers({ includedUsage: 5 });
	const wordsItem = items.monthlyWords({ includedUsage: 100 });

	// Customer-level product
	const customerPlan = products.pro({
		id: "cus-plan",
		items: [messagesItem],
	});

	// Entity-level products for multi-attach
	const entityPlanA = products.base({
		id: "ent-plan-a",
		items: [usersItem, wordsItem, items.monthlyPrice({ price: 10 })],
	});
	const entityPlanB = products.base({
		id: "ent-plan-b",
		items: [items.dashboard(), items.monthlyPrice({ price: 5 })],
		group: "group-b",
	});

	const { customerId, autumnV1, entities, advancedTo } = await initScenario({
		customerId: "ma-new-billing-sub-entity",
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [customerPlan, entityPlanA, entityPlanB] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			// Customer gets a product first (creates 1 subscription)
			s.billing.attach({ productId: customerPlan.id }),
			// Advance 15 days into the billing cycle
			s.advanceTestClock({ days: 15 }),
		],
	});

	// Verify 1 subscription exists before multi-attach
	await expectSubCount({ ctx, customerId, count: 1 });

	// Multi-attach to entity with new_billing_subscription: true
	// This should create a separate Stripe subscription
	await autumnV1.billing.multiAttach({
		customer_id: customerId,
		entity_id: entities[0].id,
		plans: [{ plan_id: entityPlanA.id }, { plan_id: entityPlanB.id }],
		new_billing_subscription: true,
	});

	// Should now have 2 subscriptions: customer plan + entity plans on separate sub
	await expectSubCount({ ctx, customerId, count: 2 });

	// Customer still has its product
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer,
		productId: customerPlan.id,
	});

	// Entity has both plans from multi-attach
	const entity = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectCustomerProducts({
		customer: entity,
		active: [entityPlanA.id, entityPlanB.id],
	});

	// Entity's Messages feature should reset at advancedTo + 1 month
	// (new billing subscription starts at advancedTo, so cycle resets 1 month later)
	expectCustomerFeatureCorrect({
		customer: entity,
		featureId: TestFeature.Words,
		balance: 100, // 100 from entity plan
		resetsAt: addMonths(advancedTo, 1).getTime(),
	});

	// Invoice: $20 (customer plan) + $15 (entity plans, full price because new sub)
	// Entity plans are NOT prorated against the customer's existing cycle
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // 1 for customer plan + 1 for entity multi-attach
		latestTotal: 15,
	});
});
