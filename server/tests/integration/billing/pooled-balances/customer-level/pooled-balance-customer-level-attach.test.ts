import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiEntityV2,
	type AttachParamsV1Input,
	type CheckResponseV3,
	EntInterval,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectPooledBalanceCorrect } from "../utils/expectPooledBalanceCorrect.js";

const CUSTOMER_GRANT = 100;
const ENTITY_GRANT = 50;
const PRIVATE_GRANT = 25;
const CUSTOMER_USAGE = 12;
const ENTITY_USAGE = 8;
const TOTAL_USAGE = CUSTOMER_USAGE + ENTITY_USAGE;

const LAZY_POOL_LIFECYCLE = {
	interval: EntInterval.Month,
	nextResetAt: "present",
	resetCycleAnchor: "present",
	resetMode: PooledBalanceResetMode.Lazy,
	stripeSubscriptionId: null,
} as const;

test(
	chalk.yellowBright(
		"pooled customer-level: a customer-scoped plan contributes to the pool like an entity",
	),
	async () => {
		const customerId = "pooled-customer-level-attach";
		const customerGroup = "pooled-customer-level-group";

		const customerPlan = products.base({
			id: "pooled-customer-level-plan",
			group: customerGroup,
			items: [
				{
					...items.monthlyMessages({ includedUsage: CUSTOMER_GRANT }),
					pooled: true,
				},
			],
		});
		const entityPlan = products.base({
			id: "pooled-entity-level-plan",
			group: "pooled-entity-level-group",
			items: [
				{
					...items.monthlyMessages({ includedUsage: ENTITY_GRANT }),
					pooled: true,
				},
			],
		});
		const privatePlan = products.base({
			id: "private-customer-level-plan",
			group: customerGroup,
			items: [items.monthlyMessages({ includedUsage: PRIVATE_GRANT })],
		});

		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [customerPlan, entityPlan, privatePlan] }),
			],
			actions: [s.billing.attach({ productId: customerPlan.id })],
		});

		const afterCustomerAttach = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: CUSTOMER_GRANT,
				adjustment: 0,
				granted: CUSTOMER_GRANT,
				...LAZY_POOL_LIFECYCLE,
			},
			contributions: {
				count: 1,
				currentContribution: CUSTOMER_GRANT,
				nextCycleContribution: CUSTOMER_GRANT,
			},
			sources: { count: 1, balance: 0, adjustment: 0 },
		});
		const pooledCustomerEntitlement =
			afterCustomerAttach.poolCustomerEntitlements[0];

		const customerLevelCustomerProduct =
			afterCustomerAttach.sourceCustomerProducts.find(
				(customerProduct) => customerProduct.product_id === customerPlan.id,
			);
		if (!customerLevelCustomerProduct) {
			throw new Error(`Customer-level '${customerPlan.id}' was not attached.`);
		}
		expect(customerLevelCustomerProduct.entity_id).toBeNull();
		expect(customerLevelCustomerProduct.internal_entity_id).toBeNull();
		expect(
			afterCustomerAttach.contributions[0].source_customer_product_id,
		).toBe(customerLevelCustomerProduct.id);

		const customerAfterAttach = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: customerAfterAttach,
			featureId: TestFeature.Messages,
			granted: CUSTOMER_GRANT,
			includedGrant: CUSTOMER_GRANT,
			remaining: CUSTOMER_GRANT,
			usage: 0,
			planId: null,
			breakdownCount: 1,
			breakdownId: pooledCustomerEntitlement.id,
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: entityPlan.id,
			plan_schedule: "immediate",
		});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: CUSTOMER_GRANT + ENTITY_GRANT,
				adjustment: 0,
				granted: CUSTOMER_GRANT + ENTITY_GRANT,
				...LAZY_POOL_LIFECYCLE,
			},
			contributions: { count: 2 },
			sources: { count: 2, balance: 0, adjustment: 0 },
		});

		const entityWithoutPlan = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[1].id,
		);
		expectBalanceCorrect({
			customer: entityWithoutPlan,
			featureId: TestFeature.Messages,
			granted: CUSTOMER_GRANT + ENTITY_GRANT,
			includedGrant: CUSTOMER_GRANT + ENTITY_GRANT,
			remaining: CUSTOMER_GRANT + ENTITY_GRANT,
			usage: 0,
			planId: null,
			breakdownCount: 1,
			breakdownId: pooledCustomerEntitlement.id,
		});

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: CUSTOMER_USAGE,
		});
		await new Promise((resolve) => setTimeout(resolve, 5000));
		await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: ENTITY_USAGE,
		});
		await new Promise((resolve) => setTimeout(resolve, 5000));

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: CUSTOMER_GRANT + ENTITY_GRANT - TOTAL_USAGE,
				adjustment: 0,
				granted: CUSTOMER_GRANT + ENTITY_GRANT,
				...LAZY_POOL_LIFECYCLE,
			},
			contributions: { count: 2 },
			sources: { count: 2, balance: 0, adjustment: 0 },
		});

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
		});
		expect(check.allowed).toBe(true);
		expect(check.balance).toMatchObject({
			granted: CUSTOMER_GRANT + ENTITY_GRANT,
			remaining: CUSTOMER_GRANT + ENTITY_GRANT - TOTAL_USAGE,
			usage: TOTAL_USAGE,
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: privatePlan.id,
			plan_schedule: "immediate",
		});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: ENTITY_GRANT - TOTAL_USAGE,
				adjustment: 0,
				granted: ENTITY_GRANT,
				...LAZY_POOL_LIFECYCLE,
			},
			contributions: {
				count: 1,
				currentContribution: ENTITY_GRANT,
				nextCycleContribution: ENTITY_GRANT,
				excludedSourceCustomerProductIds: [customerLevelCustomerProduct.id],
			},
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
	},
);
