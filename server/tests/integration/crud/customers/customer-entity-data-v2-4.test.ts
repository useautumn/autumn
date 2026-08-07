/**
 * V2_4 stops the Customer object from reporting entity-level data.
 *
 * Up to V2_3 a customer-level read folded in the subscriptions and balances
 * attached to that customer's entities — on the FullSubject path via an
 * aggregation CTE that scales with the customer's entity count, and on the
 * list path by including entity-scoped customer_products inline.
 *
 * From V2_4 both paths report only what is attached to the customer itself.
 * Entity-scoped reads are unaffected.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5, ApiEntityV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const ENTITY_PLAN_GRANT = 500;

test.concurrent(
	`${chalk.yellowBright("customer entity data: V2_3 aggregates an entity-level plan onto the customer, V2_4 does not")}`,
	async () => {
		const customerId = "cus-entity-data-v2-4";

		const pro = products.pro({
			id: "pro-entity-data-v2-4",
			items: [items.monthlyMessages({ includedUsage: ENTITY_PLAN_GRANT })],
		});

		const { autumnV2_3, autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			// Attaches the plan to the entity, not the customer.
			actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
		});

		// ── V2_3: the entity's plan and balance surface on the customer.
		const v23Customer =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(
			v23Customer.subscriptions.some((sub) => sub.plan_id === pro.id),
			"v2.3 customers.get: entity plan should be aggregated",
		).toBe(true);
		expect(
			v23Customer.balances[TestFeature.Messages]?.granted,
			"v2.3 customers.get: entity balance should be aggregated",
		).toBe(ENTITY_PLAN_GRANT);

		const v23List = (await autumnV2_3.customers.listV2({
			search: customerId,
		})) as { list: ApiCustomerV5[] };
		const v23Listed = v23List.list.find((c) => c.id === customerId);
		expect(
			v23Listed?.subscriptions.some((sub) => sub.plan_id === pro.id),
			"v2.3 customers.list: entity plan should be aggregated",
		).toBe(true);

		// ── V2_4: the customer reports only what is attached to the customer.
		//   skip_cache forces a rebuild, so this exercises the hydration query
		//   skipping the aggregation CTE rather than the response-layer strip
		//   (the read above left an aggregated subject in the cache).
		const v24Customer = await autumnV2_4.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(
			v24Customer.subscriptions.some((sub) => sub.plan_id === pro.id),
			"v2.4 customers.get: entity plan must not be aggregated",
		).toBe(false);
		expect(
			v24Customer.balances[TestFeature.Messages]?.granted ?? 0,
			"v2.4 customers.get: entity balance must not be aggregated",
		).toBe(0);

		const v24List = (await autumnV2_4.customers.listV2({
			search: customerId,
		})) as { list: ApiCustomerV5[] };
		const v24Listed = v24List.list.find((c) => c.id === customerId);
		expect(v24Listed, "v2.4 customers.list: customer missing").toBeDefined();
		expect(
			v24Listed?.subscriptions.some((sub) => sub.plan_id === pro.id),
			"v2.4 customers.list: entity plan must not be aggregated",
		).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("customer entity data: V2_4 entity-scoped reads still report the entity's own plan")}`,
	async () => {
		const customerId = "cus-entity-data-v2-4-scoped";

		const pro = products.pro({
			id: "pro-entity-data-scoped",
			items: [items.monthlyMessages({ includedUsage: ENTITY_PLAN_GRANT })],
		});

		const { autumnV2_4, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
		});

		const entity = await autumnV2_4.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);

		expect(
			entity.subscriptions?.some((sub) => sub.plan_id === pro.id),
			"v2.4 entity read: entity keeps its own plan",
		).toBe(true);
	},
);
