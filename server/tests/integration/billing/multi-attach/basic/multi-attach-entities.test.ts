import { test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import {
	expectCustomerFeatureCorrect,
	expectCustomerFeatureExists,
} from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// Test 1: Multi-attach at entity level when customer has product
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach entities: entity-level multi-attach when customer has product")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const usersItem = items.monthlyUsers({ includedUsage: 5 });

	// Customer-level product
	const customerPlan = products.pro({
		id: "cus-plan",
		items: [messagesItem],
	});

	// Entity-level products
	const entityPlanA = products.base({
		id: "ent-plan-a",
		items: [usersItem, items.monthlyPrice({ price: 10 })],
	});
	const entityPlanB = products.base({
		id: "ent-plan-b",
		items: [items.dashboard(), items.monthlyPrice({ price: 5 })],
		group: `${customerPlan.id}-group-b`,
	});

	const { customerId, autumnV1, entities } = await initScenario({
		customerId: "ma-ent-cus-has-product",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({
				list: [customerPlan, entityPlanA, entityPlanB],
			}),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Customer already has a product
			s.billing.attach({ productId: customerPlan.id }),
		],
	});

	// Multi-attach to entity 0
	await autumnV1.billing.multiAttach({
		customer_id: customerId,
		entity_id: entities[0].id,
		plans: [{ plan_id: entityPlanA.id }, { plan_id: entityPlanB.id }],
	});

	// Verify entity 0 has both entity plans
	const entity0 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectCustomerProducts({
		customer: entity0,
		active: [entityPlanA.id, entityPlanB.id],
	});

	// Entity 0 should have dashboard from entityPlanB
	await expectCustomerFeatureExists({
		customer: entity0,
		featureId: TestFeature.Dashboard,
	});

	// Verify entity 1 has no entity-level products
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductNotPresent({
		customer: entity1,
		productId: entityPlanA.id,
	});
	await expectProductNotPresent({
		customer: entity1,
		productId: entityPlanB.id,
	});

	// Customer still has its product
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer,
		productId: customerPlan.id,
	});

	// Invoice: $20 (customer plan) + $10 (entity plan A) + $5 (entity plan B) = $35
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // 1 for customer plan attach + 1 for entity multi-attach
		latestTotal: 15,
	});
});

// ═══════════════════════════════════════════════════════════════════
// Test 2: Multi-attach at entity level when sibling entity has product
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach entities: entity-level when sibling entity has product")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 200 });
	const usersItem = items.monthlyUsers({ includedUsage: 5 });

	const planA = products.pro({
		id: "plan-a",
		items: [messagesItem],
	});
	const planB = products.base({
		id: "plan-b",
		items: [usersItem, items.monthlyPrice({ price: 25 })],
		group: "group-b",
	});

	const { customerId, autumnV1, entities } = await initScenario({
		customerId: "ma-ent-sibling",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [planA, planB] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Entity 0 already has planA
			s.billing.attach({ productId: planA.id, entityIndex: 0 }),
		],
	});

	// Multi-attach planB to entity 1 (sibling)
	await autumnV1.billing.multiAttach({
		customer_id: customerId,
		entity_id: entities[1].id,
		plans: [{ plan_id: planB.id }],
	});

	// Entity 0 has planA, not planB
	const entity0 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entity0,
		productId: planA.id,
	});
	await expectProductNotPresent({
		customer: entity0,
		productId: planB.id,
	});

	// Entity 1 has planB, not planA
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity1,
		productId: planB.id,
	});
	await expectProductNotPresent({
		customer: entity1,
		productId: planA.id,
	});
});

// ═══════════════════════════════════════════════════════════════════
// Test 3: Multi-attach at customer level when entity has product
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach entities: customer-level multi-attach when entity has product")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const wordsItem = items.monthlyWords({ includedUsage: 50 });

	// Entity will have this product
	const entityPlan = products.pro({
		id: "ent-plan",
		items: [messagesItem],
	});

	// Customer-level plans
	const cusPlanA = products.base({
		id: "cus-plan-a",
		items: [wordsItem, items.monthlyPrice({ price: 15 })],
	});
	const cusPlanB = products.base({
		id: "cus-plan-b",
		items: [items.dashboard(), items.monthlyPrice({ price: 10 })],
		group: "group-b",
	});

	const { customerId, autumnV1, entities } = await initScenario({
		customerId: "ma-ent-cus-level",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [entityPlan, cusPlanA, cusPlanB] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			// Entity 0 already has entityPlan
			s.billing.attach({ productId: entityPlan.id, entityIndex: 0 }),
		],
	});

	// Multi-attach at customer level
	await autumnV1.billing.multiAttach({
		customer_id: customerId,
		plans: [{ plan_id: cusPlanA.id }, { plan_id: cusPlanB.id }],
	});

	// Customer has both customer-level plans
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [cusPlanA.id, cusPlanB.id],
	});

	// Entity 0 still has its own plan
	const entity0 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entity0,
		productId: entityPlan.id,
	});

	// Customer features: words from cusPlanA + messages from entity's plan (inherited)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 50,
	});

	// Dashboard from cusPlanB
	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});
});
