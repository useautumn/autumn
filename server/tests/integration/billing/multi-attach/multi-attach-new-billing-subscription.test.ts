import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type ApiCustomerV3,
	type ApiEntityV0,
} from "@autumn/shared";
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
import { CusService } from "@/internal/customers/CusService";

test.concurrent(`${chalk.yellowBright("multi-attach new-billing-sub: entity multi-attach creates separate subscription mid-cycle")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const usersItem = items.monthlyUsers({ includedUsage: 5 });
	const wordsItem = items.monthlyWords({ includedUsage: 100 });

	const customerPlan = products.pro({
		id: "cus-plan",
		items: [messagesItem],
	});

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
			s.billing.attach({ productId: customerPlan.id }),
			s.advanceTestClock({ days: 15 }),
		],
	});

	await expectSubCount({ ctx, customerId, count: 1 });

	await autumnV1.billing.multiAttach({
		customer_id: customerId,
		entity_id: entities[0].id,
		plans: [{ plan_id: entityPlanA.id }, { plan_id: entityPlanB.id }],
		new_billing_subscription: true,
	});

	await expectSubCount({ ctx, customerId, count: 2 });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer,
		productId: customerPlan.id,
	});

	const entity = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectCustomerProducts({
		customer: entity,
		active: [entityPlanA.id, entityPlanB.id],
	});

	expectCustomerFeatureCorrect({
		customer: entity,
		featureId: TestFeature.Words,
		balance: 100,
		resetsAt: addMonths(advancedTo, 1).getTime(),
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 15,
	});
});

test.concurrent(
	`${chalk.yellowBright("multi-attach new-billing-sub: free to paid creates a new cycle beside an unrelated paid subscription")}`,
	async () => {
		const free = products.base({
			id: "free-main",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});
		const addOn = products.recurringAddOn({
			id: "paid-add-on",
			items: [items.monthlyWords({ includedUsage: 200 })],
		});
		const paid = products.pro({
			id: "paid-main",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});
		const { autumnV1, autumnV2_2, customerId } = await initScenario({
			customerId: "ma-new-billing-sub-free-to-paid",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, addOn, paid] }),
			],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.billing.attach({ productId: addOn.id }),
			],
		});

		await expectSubCount({ ctx, customerId, count: 1 });
		await autumnV2_2.billing.multiAttach({
			customer_id: customerId,
			plans: [{ plan_id: paid.id }],
			new_billing_subscription: true,
		});

		await expectSubCount({ ctx, customerId, count: 2 });
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});
		const subscriptionIdByProduct = new Map(
			fullCustomer.customer_products.map((customerProduct) => [
				customerProduct.product_id,
				customerProduct.subscription_ids?.[0],
			]),
		);
		expect(subscriptionIdByProduct.get(paid.id)).toBeDefined();
		expect(subscriptionIdByProduct.get(paid.id)).not.toBe(
			subscriptionIdByProduct.get(addOn.id),
		);
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [paid.id, addOn.id],
			notPresent: [free.id],
		});
	},
);
