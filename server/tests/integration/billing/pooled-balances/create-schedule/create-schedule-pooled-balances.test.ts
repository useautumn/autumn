/** Entity schedules reconcile immediate in-scope products; future products and unrelated pools or prepaid remain untouched.
 * Customer schedules leave every entity-scoped pooled contribution unchanged. */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	CusProductStatus,
	EntInterval,
	ms,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectPooledBalanceCorrect } from "../utils/expectPooledBalanceCorrect.js";
import {
	getPooledSourceCustomerProduct,
	type PooledBalanceDbState,
} from "../utils/getPooledBalanceDbState.js";

const USAGE = 50;
const MONTHLY_LAZY_POOL = {
	interval: EntInterval.Month,
	nextResetAt: "present",
	resetCycleAnchor: "present",
	resetMode: PooledBalanceResetMode.Lazy,
	stripeSubscriptionId: null,
} as const;

const pooledMessagesPlan = ({
	id,
	grant,
	group,
}: {
	id: string;
	grant: number;
	group: string;
}) =>
	products.base({
		id,
		group,
		items: [
			{
				...items.monthlyMessages({ includedUsage: grant }),
				pooled: true,
			},
		],
	});

const getContributionForSource = ({
	state,
	sourceCustomerProductId,
}: {
	state: PooledBalanceDbState;
	sourceCustomerProductId: string;
}) => {
	const contribution = state.contributions.find(
		(candidate) =>
			candidate.source_customer_product_id === sourceCustomerProductId,
	);
	if (!contribution) {
		throw new Error(
			`Missing pooled contribution for '${sourceCustomerProductId}'.`,
		);
	}
	return contribution;
};

const getCustomerLevelCustomerProduct = ({
	state,
	productId,
}: {
	state: PooledBalanceDbState;
	productId: string;
}) => {
	const customerProduct = state.sourceCustomerProducts.find(
		(candidate) =>
			candidate.product_id === productId && candidate.entity_id === null,
	);
	if (!customerProduct) {
		throw new Error(`Missing customer-level product '${productId}'.`);
	}
	return customerProduct;
};

test.concurrent(
	`${chalk.yellowBright("pooled create-schedule: entity wholesale replacement preserves unrelated sources")}`,
	async () => {
		const customerId = "pooled-create-schedule-entity";
		const outgoingA = pooledMessagesPlan({
			id: "pooled-schedule-outgoing-a",
			grant: 100,
			group: "primary",
		});
		const outgoingB = pooledMessagesPlan({
			id: "pooled-schedule-outgoing-b",
			grant: 200,
			group: "secondary",
		});
		const incomingA = pooledMessagesPlan({
			id: "pooled-schedule-incoming-a",
			grant: 150,
			group: "primary",
		});
		const incomingB = pooledMessagesPlan({
			id: "pooled-schedule-incoming-b",
			grant: 250,
			group: "secondary",
		});
		const futureA = pooledMessagesPlan({
			id: "pooled-schedule-future-a",
			grant: 300,
			group: "primary",
		});
		const futureB = pooledMessagesPlan({
			id: "pooled-schedule-future-b",
			grant: 400,
			group: "secondary",
		});
		const prepaidCredits = products.oneOffAddOn({
			id: "pooled-schedule-prepaid-credits",
			items: [items.oneOffWords({ includedUsage: 75 })],
		});

		const { entities, autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({
					list: [
						outgoingA,
						outgoingB,
						incomingA,
						incomingB,
						futureA,
						futureB,
						prepaidCredits,
					],
				}),
			],
			actions: [
				s.billing.attach({ productId: prepaidCredits.id }),
				s.billing.attach({ productId: outgoingA.id, entityIndex: 0 }),
				s.billing.attach({ productId: outgoingB.id, entityIndex: 0 }),
				s.billing.attach({ productId: outgoingA.id, entityIndex: 1 }),
				s.track({
					featureId: TestFeature.Messages,
					value: USAGE,
					entityIndex: 2,
					timeout: 2000,
				}),
			],
		});

		const before = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 350,
				adjustment: 0,
				granted: 400,
				...MONTHLY_LAZY_POOL,
			},
			contributions: { count: 3 },
			sources: { count: 3, balance: 0, adjustment: 0 },
		});
		const unrelatedCustomerProduct = getPooledSourceCustomerProduct({
			state: before,
			productId: outgoingA.id,
			entityId: entities[1]!.id,
		});
		const unrelatedContribution = getContributionForSource({
			state: before,
			sourceCustomerProductId: unrelatedCustomerProduct.id,
		});
		const outgoingCustomerProductIds = [outgoingA, outgoingB].map(
			(product) =>
				getPooledSourceCustomerProduct({
					state: before,
					productId: product.id,
					entityId: entities[0]!.id,
				}).id,
		);
		const prepaidCustomerProduct = getCustomerLevelCustomerProduct({
			state: before,
			productId: prepaidCredits.id,
		});
		const prepaidEntitlement =
			prepaidCustomerProduct.customer_entitlements.find(
				(customerEntitlement) =>
					customerEntitlement.feature_id === TestFeature.Words,
			);
		expect(prepaidEntitlement?.balance).toBeGreaterThan(0);

		await autumnV2_2.billing.createSchedule({
			customer_id: customerId,
			entity_id: entities[0]!.id,
			phases: [
				{
					starts_at: advancedTo,
					plans: [{ plan_id: incomingA.id }, { plan_id: incomingB.id }],
				},
				{
					starts_at: advancedTo + ms.days(30),
					plans: [{ plan_id: futureA.id }, { plan_id: futureB.id }],
				},
			],
		});

		const after = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 450,
				adjustment: 0,
				granted: 500,
				...MONTHLY_LAZY_POOL,
			},
			contributions: {
				count: 3,
				excludedSourceCustomerProductIds: outgoingCustomerProductIds,
			},
			sources: { count: 7 },
		});
		const preservedContribution = getContributionForSource({
			state: after,
			sourceCustomerProductId: unrelatedCustomerProduct.id,
		});
		expect(preservedContribution.id).toBe(unrelatedContribution.id);
		expect(preservedContribution).toMatchObject({
			current_contribution: 100,
			next_cycle_contribution: 100,
		});

		for (const [product, expectedContribution] of [
			[incomingA, 150],
			[incomingB, 250],
		] as const) {
			const customerProduct = getPooledSourceCustomerProduct({
				state: after,
				productId: product.id,
				entityId: entities[0]!.id,
			});
			expect(
				getContributionForSource({
					state: after,
					sourceCustomerProductId: customerProduct.id,
				}),
			).toMatchObject({
				current_contribution: expectedContribution,
				next_cycle_contribution: expectedContribution,
			});
		}

		for (const futureProduct of [futureA, futureB]) {
			const customerProduct = getPooledSourceCustomerProduct({
				state: after,
				productId: futureProduct.id,
				entityId: entities[0]!.id,
			});
			expect(customerProduct.status).toBe(CusProductStatus.Scheduled);
			expect(
				after.contributions.some(
					(contribution) =>
						contribution.source_customer_product_id === customerProduct.id,
				),
			).toBe(false);
		}

		const preservedPrepaidCustomerProduct = getCustomerLevelCustomerProduct({
			state: after,
			productId: prepaidCredits.id,
		});
		expect(preservedPrepaidCustomerProduct.id).toBe(prepaidCustomerProduct.id);
		expect(preservedPrepaidCustomerProduct.status).toBe(
			CusProductStatus.Active,
		);
		expect(
			preservedPrepaidCustomerProduct.customer_entitlements.find(
				(customerEntitlement) =>
					customerEntitlement.feature_id === TestFeature.Words,
			)?.balance,
		).toBe(prepaidEntitlement?.balance);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: 500,
			includedGrant: 500,
			remaining: 450,
			usage: USAGE,
			planId: null,
			breakdownCount: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled create-schedule: customer replacement preserves entity pools")}`,
	async () => {
		const customerId = "pooled-create-schedule-customer";
		const entityPool = pooledMessagesPlan({
			id: "pooled-schedule-entity-pool",
			grant: 100,
			group: "entity-pool",
		});
		const currentCustomerPlan = products.base({
			id: "pooled-schedule-customer-current",
			group: "customer-plan",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});
		const incomingCustomerPlan = products.base({
			id: "pooled-schedule-customer-incoming",
			group: "customer-plan",
			items: [items.monthlyWords({ includedUsage: 50 })],
		});

		const { entities, autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({
					list: [entityPool, currentCustomerPlan, incomingCustomerPlan],
				}),
			],
			actions: [
				s.billing.attach({ productId: entityPool.id, entityIndex: 0 }),
				s.billing.attach({ productId: entityPool.id, entityIndex: 1 }),
				s.billing.attach({ productId: currentCustomerPlan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: USAGE,
					entityIndex: 2,
					timeout: 2000,
				}),
			],
		});

		const before = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 150,
				adjustment: 0,
				granted: 200,
				...MONTHLY_LAZY_POOL,
			},
			contributions: {
				count: 2,
				currentContribution: 100,
				nextCycleContribution: 100,
			},
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
		const contributionIds = before.contributions.map(
			(contribution) => contribution.id,
		);
		const entityCustomerProductIds = entities.slice(0, 2).map(
			(entity) =>
				getPooledSourceCustomerProduct({
					state: before,
					productId: entityPool.id,
					entityId: entity.id,
				}).id,
		);

		await autumnV2_2.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [{ plan_id: incomingCustomerPlan.id }],
				},
			],
		});

		const after = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 150,
				adjustment: 0,
				granted: 200,
				...MONTHLY_LAZY_POOL,
			},
			contributions: {
				count: 2,
				currentContribution: 100,
				nextCycleContribution: 100,
			},
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
		expect(
			after.contributions.map((contribution) => contribution.id).sort(),
		).toEqual(contributionIds.sort());
		for (const customerProductId of entityCustomerProductIds) {
			expect(
				after.sourceCustomerProducts.find(
					(customerProduct) => customerProduct.id === customerProductId,
				),
			).toMatchObject({ status: CusProductStatus.Active });
		}
	},
);
