import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiCustomerV5Schema,
} from "@shared/api/customers/apiCustomerV5";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER SCOPE — `scope` field on subscriptions and purchases
//
// Contract under test:
//   New types/fields:
//     - ApiSubscriptionV1.scope: "customer" | "entity"
//     - ApiPurchaseV0.scope:    "customer" | "entity"
//   New behaviors:
//     - Customer-level product (internal_entity_id === null) → "customer"
//     - Entity-level product (internal_entity_id !== null)   → "entity"
//   Side effects: none (pure projection from existing FullCusProduct).
//
// Pre-impl red: scope field is undefined, schema parse rejects.
// Post-impl green: all assertions pass.
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("customer scope: customer-level subscription has scope=customer, entity-level has scope=entity")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const creditsItem = items.monthlyCredits({ includedUsage: 200 });

		const cusLevelProd = products.pro({
			id: "cus-lvl-scope",
			items: [messagesItem],
		});
		const entityProd = products.base({
			id: "ent-prod-scope",
			items: [creditsItem],
		});

		const customerId = "customer-scope-test";

		const { autumnV2_2, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [cusLevelProd, entityProd] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: cusLevelProd.id }),
				s.attach({
					productId: entityProd.id,
					entityIndex: 0,
				}),
			],
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			keepInternalFields: true,
		});
		ApiCustomerV5Schema.parse(customer);

		// ── Customer-level subscription ──
		const cusSub = customer.subscriptions.find(
			(s) => s.plan_id === cusLevelProd.id,
		);
		expect(cusSub).toBeDefined();
		expect(cusSub!.scope).toBe("customer");

		// ── Entity-level subscription ──
		const entSub = customer.subscriptions.find(
			(s) => s.plan_id === entityProd.id,
		);
		expect(entSub).toBeDefined();
		expect(entSub!.scope).toBe("entity");
	},
);

test.concurrent(
	`${chalk.yellowBright("customer scope: purchase (one-off) has scope=customer")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({ includedUsage: 50 });
		const oneOffProd = products.oneOff({
			id: "one-off-scope",
			items: [oneOffItem],
		});

		const customerId = "customer-scope-one-off";

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [oneOffProd] }),
			],
			actions: [s.billing.attach({ productId: oneOffProd.id })],
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			keepInternalFields: true,
		});
		ApiCustomerV5Schema.parse(customer);

		expect(customer.purchases.length).toBe(1);
		expect(customer.purchases[0].scope).toBe("customer");
	},
);

test.concurrent(
	`${chalk.yellowBright("customer scope: cached and uncached reads match")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "scope-cache", items: [messagesItem] });

		const customerId = "customer-scope-cache";

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const cached = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expect(cached.subscriptions[0].scope).toBe("customer");

		const uncached = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expect(uncached.subscriptions[0].scope).toBe("customer");
	},
);
