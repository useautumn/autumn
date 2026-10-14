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

test.concurrent(`${chalk.yellowBright("multi-attach entities: entity-level multi-attach when customer has product")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const usersItem = items.monthlyUsers({ includedUsage: 5 });

	const customerPlan = products.pro({
		id: "cus-plan",
		items: [messagesItem],
	});

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
			s.billing.attach({ productId: customerPlan.id }),
		],
	});

	await autumnV1.billing.multiAttach({
		customer_id: customerId,
		entity_id: entities[0].id,
		plans: [{ plan_id: entityPlanA.id }, { plan_id: entityPlanB.id }],
	});

	const entity0 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectCustomerProducts({
		customer: entity0,
		active: [entityPlanA.id, entityPlanB.id],
	});

	await expectCustomerFeatureExists({
		customer: entity0,
		featureId: TestFeature.Dashboard,
	});

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

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer,
		productId: customerPlan.id,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 15,
	});
});

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
			s.billing.attach({ productId: planA.id, entityIndex: 0 }),
		],
	});

	await autumnV1.billing.multiAttach({
		customer_id: customerId,
		entity_id: entities[1].id,
		plans: [{ plan_id: planB.id }],
	});

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

test.concurrent(`${chalk.yellowBright("multi-attach entities: customer-level multi-attach when entity has product")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const wordsItem = items.monthlyWords({ includedUsage: 50 });

	const entityPlan = products.pro({
		id: "ent-plan",
		items: [messagesItem],
	});

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
			s.billing.attach({ productId: entityPlan.id, entityIndex: 0 }),
		],
	});

	await autumnV1.billing.multiAttach({
		customer_id: customerId,
		plans: [{ plan_id: cusPlanA.id }, { plan_id: cusPlanB.id }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [cusPlanA.id, cusPlanB.id],
	});

	const entity0 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entity0,
		productId: entityPlan.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 50,
	});

	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});
});
