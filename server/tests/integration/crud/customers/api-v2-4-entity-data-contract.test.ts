/**
 * API v2.4: customer-level reads drop entity-level subscriptions and balances.
 *
 * V2.3 still aggregates. Entity-scoped reads and check are unchanged.
 * skip_cache rebuilds prove the FullSubject SQL gate, not only the response strip.
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
			cursorPage.list.find((customer) => customer.id === customerId),
		],
		[
			"GET /v1/customers (offset)",
			offsetPage.list.find((customer) => customer.id === customerId),
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
}): boolean =>
	!!customer?.subscriptions.some(
		(subscription) => subscription.plan_id === planId,
	);

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
			expect(
				hasPlan({ customer, planId: entityPlan.id }),
				`${label}: entity plan must be excluded`,
			).toBe(false);
			expect(
				grantedFor({ customer, featureId: TestFeature.Words }),
				`${label}: entity grant must be excluded`,
			).toBe(0);
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

		const listed = await autumnV2_4.entitiesV2.list<{ list: ApiEntityV2[] }>({
			customer_id: customerId,
		});
		const listedEntity = listed.list.find((row) => row.id === entities[0].id);
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

		const cached = await autumnV2_4.customers.get<ApiCustomerV5>(customerId);
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
			expect(
				hasPlan({ customer, planId: customerPlan.id }),
				`${label}: customer plan intact`,
			).toBe(true);
		}

		const checkRes = (await autumnV2_4.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as { allowed: boolean };
		expect(checkRes.allowed, "check: customer balance still allowed").toBe(
			true,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("api v2.4 contract: customers.get excludes entity-scoped standalone balances")}`,
	async () => {
		const customerId = "v24-contract-standalone-entity";
		const customerGrant = 100;
		const entityGrant = 300;

		const { autumnV2_4, entities } = await setupScenario({ customerId });

		await autumnV2_4.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Storage,
			included_grant: customerGrant,
		});

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
			expect(
				grantedFor({ customer, featureId: TestFeature.Storage }),
				`${label}: entity-scoped standalone grant must be excluded`,
			).toBe(customerGrant);

			const entityScopedItem = customer.balances[
				TestFeature.Storage
			]?.breakdown?.find((item) => item.included_grant === entityGrant);
			expect(
				entityScopedItem,
				`${label}: entity standalone breakdown row must be absent`,
			).toBeUndefined();
		}

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
