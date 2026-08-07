/**
 * Contract test for API version 2.4.
 *
 * Contract under test:
 *   New types/fields:
 *     - none. V2_4 is a side-effect version change (V2_3_CustomerEntityData).
 *   New behaviors (customer-level read, request at V2_4):
 *     - subscriptions exclude plans attached to the customer's entities
 *     - balances exclude grants that came from those entity-attached plans
 *     - plans/balances attached to the CUSTOMER are still reported in full
 *   Applies to every customer-level read path:
 *     - POST /customers.get
 *     - GET  /v1/customers/:customer_id
 *     - POST /customers/list          (cursor pagination, latest)
 *     - GET  /v1/customers            (legacy offset pagination)
 *     - POST /customers               (get_or_create)
 *   Unchanged by this version:
 *     - <= V2_3 still aggregates entity data onto the customer
 *     - entity-scoped reads (entities.get / entities.list) report the entity's own plan
 *     - check still evaluates the customer's own balances
 *     - a cached subject and a cold rebuild return the same thing at V2_4
 *   Side effects:
 *     - hydration skips the entity-aggregate CTEs; both list queries drop
 *       entity-scoped rows. Not directly observable, so asserted via the
 *       cold-rebuild (skip_cache) path, which is the only route that proves
 *       the SQL gate rather than the response-layer strip.
 *
 * The customer-level plan grants `messages` and the entity-level plan grants
 * `words`, so the assertions separate "entity data excluded" from the opposite
 * failure mode, "customer data over-filtered".
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5, ApiEntityV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

const CUSTOMER_GRANT = 100;
const ENTITY_GRANT = 500;

/**
 * Products are built per test rather than shared: initScenario rewrites
 * `product.id` in place, so a module-level fixture would accumulate every
 * concurrent test's customerId.
 */
const setupScenario = async ({ customerId }: { customerId: string }) => {
	const customerPlan = products.base({
		id: `v24-cus-plan-${customerId}`,
		items: [items.monthlyMessages({ includedUsage: CUSTOMER_GRANT })],
	});

	const entityPlan = products.pro({
		id: `v24-ent-plan-${customerId}`,
		items: [items.monthlyWords({ includedUsage: ENTITY_GRANT })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [customerPlan, entityPlan] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: customerPlan.id }),
			s.attach({ productId: entityPlan.id, entityIndex: 0 }),
		],
	});

	return { ...scenario, customerPlan, entityPlan };
};

/** Every customer-level read path the contract names, labelled for assertions. */
const readCustomerEveryWay = async ({
	autumn,
	customerId,
}: {
	autumn: AutumnInt;
	customerId: string;
}): Promise<[string, ApiCustomerV5 | undefined][]> => {
	const rpcGet = (await autumn.post("/customers.get", {
		customer_id: customerId,
	})) as ApiCustomerV5;

	const legacyGet = await autumn.customers.get<ApiCustomerV5>(customerId);

	const cursorPage = (await autumn.customers.listV2({
		search: customerId,
		limit: 10,
	})) as { list: ApiCustomerV5[] };

	const offsetPage = (await autumn.customers.list({ limit: 100 })) as {
		list: ApiCustomerV5[];
	};

	const getOrCreate = (await autumn.customers.create({
		id: customerId,
	})) as ApiCustomerV5;

	return [
		["POST /customers.get", rpcGet],
		["GET /v1/customers/:id", legacyGet],
		[
			"POST /customers/list (cursor)",
			cursorPage.list.find((c) => c.id === customerId),
		],
		[
			"GET /v1/customers (offset)",
			offsetPage.list.find((c) => c.id === customerId),
		],
		["POST /customers (get_or_create)", getOrCreate],
	];
};

const grantedFor = ({
	customer,
	featureId,
}: {
	customer: ApiCustomerV5 | undefined;
	featureId: string;
}): number => customer?.balances[featureId]?.granted ?? 0;

const hasPlan = ({
	customer,
	planId,
}: {
	customer: ApiCustomerV5 | undefined;
	planId: string;
}): boolean => !!customer?.subscriptions.some((sub) => sub.plan_id === planId);

test.concurrent(
	`${chalk.yellowBright("api v2.4 contract: every customer-level read path excludes entity data and keeps customer data")}`,
	async () => {
		const customerId = "v24-contract-read-paths";
		const { autumnV2_4, customerPlan, entityPlan } = await setupScenario({
			customerId,
		});

		const reads = await readCustomerEveryWay({
			autumn: autumnV2_4,
			customerId,
		});

		for (const [label, customer] of reads) {
			expect(customer, `${label}: customer missing`).toBeDefined();

			// ── Contract: entity-attached plan and its grant are excluded.
			expect(
				hasPlan({ customer, planId: entityPlan.id }),
				`${label}: entity plan must be excluded`,
			).toBe(false);
			expect(
				grantedFor({ customer, featureId: TestFeature.Words }),
				`${label}: entity grant must be excluded`,
			).toBe(0);

			// ── Contract: the customer's own plan and grant are untouched.
			expect(
				hasPlan({ customer, planId: customerPlan.id }),
				`${label}: customer plan must be reported`,
			).toBe(true);
			expect(
				grantedFor({ customer, featureId: TestFeature.Messages }),
				`${label}: customer grant must be reported`,
			).toBe(CUSTOMER_GRANT);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("api v2.4 contract: V2_3 and below still aggregate entity data onto the customer")}`,
	async () => {
		const customerId = "v24-contract-v23-unchanged";
		const { autumnV2_3, customerPlan, entityPlan } = await setupScenario({
			customerId,
		});

		const reads = await readCustomerEveryWay({
			autumn: autumnV2_3,
			customerId,
		});

		for (const [label, customer] of reads) {
			expect(customer, `${label}: customer missing`).toBeDefined();

			// ── Contract: unchanged for existing clients.
			expect(
				hasPlan({ customer, planId: entityPlan.id }),
				`${label}: v2.3 keeps the entity plan`,
			).toBe(true);
			expect(
				grantedFor({ customer, featureId: TestFeature.Words }),
				`${label}: v2.3 keeps the entity grant`,
			).toBe(ENTITY_GRANT);
			expect(
				hasPlan({ customer, planId: customerPlan.id }),
				`${label}: v2.3 keeps the customer plan`,
			).toBe(true);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("api v2.4 contract: entity-scoped reads still report the entity's own plan")}`,
	async () => {
		const customerId = "v24-contract-entity-reads";
		const { autumnV2_4, entities, entityPlan } = await setupScenario({
			customerId,
		});

		// ── Contract: entities.get is unaffected.
		const entity = await autumnV2_4.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		expect(
			entity.subscriptions?.some((sub) => sub.plan_id === entityPlan.id),
			"entities.get: entity keeps its own plan",
		).toBe(true);
		expect(
			entity.balances?.[TestFeature.Words]?.granted,
			"entities.get: entity keeps its own grant",
		).toBe(ENTITY_GRANT);

		// ── Contract: entities.list is unaffected. The RPC route returns the
		//   ApiEntity shape; the legacy GET /customers/:id/entities returns raw
		//   rows with no subscriptions at all.
		const listed = (await autumnV2_4.post("/entities.list", {
			customer_id: customerId,
		})) as { list: ApiEntityV2[] };
		const listedEntity = listed.list.find((e) => e.id === entities[0].id);
		expect(
			listedEntity?.subscriptions?.some((sub) => sub.plan_id === entityPlan.id),
			"entities.list: entity keeps its own plan",
		).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("api v2.4 contract: cached read and cold rebuild agree, and check still evaluates customer balances")}`,
	async () => {
		const customerId = "v24-contract-cache-parity";
		const { autumnV2_4, customerPlan, entityPlan } = await setupScenario({
			customerId,
		});

		// Warms the subject cache.
		const cached = await autumnV2_4.customers.get<ApiCustomerV5>(customerId);
		// skip_cache forces a rebuild, so this is the only assertion that proves
		// the hydration query skipped the aggregate CTEs rather than the
		// response layer stripping an aggregated subject.
		const rebuilt = await autumnV2_4.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});

		for (const [label, customer] of [
			["cached", cached],
			["cold rebuild", rebuilt],
		] as const) {
			expect(
				hasPlan({ customer, planId: entityPlan.id }),
				`${label}: entity plan excluded`,
			).toBe(false);
			expect(
				grantedFor({ customer, featureId: TestFeature.Messages }),
				`${label}: customer grant intact`,
			).toBe(CUSTOMER_GRANT);
		}

		// ── Contract: check is unaffected — it evaluates the customer's own balance.
		const checkRes = (await autumnV2_4.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as { allowed: boolean };
		expect(checkRes.allowed, "check: customer balance still allowed").toBe(
			true,
		);
	},
);

// Standalone balances (customer_product_id NULL, from balances.create) can be
// scoped to an entity via entity_id. Those are entity-level data too, so a
// customer-level read must not report them — the grant nor its consumption.
test.concurrent(
	`${chalk.yellowBright("api v2.4 contract: customers.get excludes entity-scoped standalone balances")}`,
	async () => {
		const customerId = "v24-contract-standalone-entity";
		const customerGrant = 100;
		const entityGrant = 300;

		const { autumnV2_4, entities } = await setupScenario({ customerId });

		// Customer-level standalone grant — the control.
		await autumnV2_4.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Storage,
			included_grant: customerGrant,
		});

		// Entity-scoped standalone grant on the SAME feature, so any leak shows up
		// as an inflated number rather than an extra key.
		await autumnV2_4.balances.create({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Storage,
			included_grant: entityGrant,
		});

		const cached = await autumnV2_4.customers.get<ApiCustomerV5>(customerId);
		const rebuilt = await autumnV2_4.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});

		for (const [label, customer] of [
			["cached", cached],
			["cold rebuild", rebuilt],
		] as const) {
			// ── Contract: only the customer's own standalone grant is reported.
			expect(
				grantedFor({ customer, featureId: TestFeature.Storage }),
				`${label}: entity-scoped standalone grant must be excluded`,
			).toBe(customerGrant);

			// ── Contract: no breakdown row carries the entity grant.
			const entityScopedItem = customer.balances[
				TestFeature.Storage
			]?.breakdown?.find((item) => item.included_grant === entityGrant);
			expect(
				entityScopedItem,
				`${label}: entity standalone breakdown row must be absent`,
			).toBeUndefined();
		}

		// ── Contract: the entity itself still reports its own standalone grant.
		const entity = await autumnV2_4.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		expect(
			entity.balances?.[TestFeature.Storage]?.granted,
			"entities.get: entity keeps its own standalone grant",
		).toBe(entityGrant + customerGrant);
	},
);
