/** Multi-attach replaces every in-scope pooled source without disturbing other scopes. */

import { expect, test } from "bun:test";
import { EntInterval, PooledBalanceResetMode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectPooledBalanceCorrect } from "./utils/expectPooledBalanceCorrect.js";
import {
	getPooledSourceCustomerProduct,
	type PooledBalanceDbState,
} from "./utils/getPooledBalanceDbState.js";

const pooledPlan = ({
	id,
	group,
	grant,
}: {
	id: string;
	group: string;
	grant: number;
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

const getContribution = ({
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
	if (!contribution) throw new Error("Expected pooled contribution");
	return contribution;
};

test.concurrent(
	`${chalk.yellowBright("pooled multi-attach: wholesale entity replacement preserves unrelated sources")}`,
	async () => {
		const customerId = "pooled-multi-attach-entity-replacement";
		const outgoingPrimary = pooledPlan({
			id: "outgoing-primary",
			group: "primary",
			grant: 100,
		});
		const outgoingSecondary = pooledPlan({
			id: "outgoing-secondary",
			group: "secondary",
			grant: 200,
		});
		const incomingPrimary = pooledPlan({
			id: "incoming-primary",
			group: "primary",
			grant: 150,
		});
		const incomingSecondary = pooledPlan({
			id: "incoming-secondary",
			group: "secondary",
			grant: 250,
		});

		const { entities, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer(),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({
					list: [
						outgoingPrimary,
						outgoingSecondary,
						incomingPrimary,
						incomingSecondary,
					],
				}),
			],
			actions: [
				s.billing.attach({ productId: outgoingPrimary.id, entityIndex: 0 }),
				s.billing.attach({ productId: outgoingSecondary.id, entityIndex: 0 }),
				s.billing.attach({ productId: outgoingPrimary.id, entityIndex: 1 }),
			],
		});

		const before = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 400,
				adjustment: 0,
				granted: 400,
				interval: EntInterval.Month,
				nextResetAt: "present",
				resetCycleAnchor: "present",
				resetMode: PooledBalanceResetMode.Lazy,
				stripeSubscriptionId: null,
			},
			contributions: { count: 3 },
			sources: { count: 3 },
		});
		const unrelatedSource = getPooledSourceCustomerProduct({
			state: before,
			productId: outgoingPrimary.id,
			entityId: entities[1]!.id,
		});
		const unrelatedContribution = getContribution({
			state: before,
			sourceCustomerProductId: unrelatedSource.id,
		});
		const outgoingSourceIds = [outgoingPrimary, outgoingSecondary].map(
			(product) =>
				getPooledSourceCustomerProduct({
					state: before,
					productId: product.id,
					entityId: entities[0]!.id,
				}).id,
		);

		await autumnV2_2.billing.multiAttach({
			customer_id: customerId,
			entity_id: entities[0]!.id,
			plans: [
				{ plan_id: incomingPrimary.id },
				{ plan_id: incomingSecondary.id },
			],
		});

		const after = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 500,
				adjustment: 0,
				granted: 500,
				interval: EntInterval.Month,
				nextResetAt: "present",
				resetCycleAnchor: "present",
				resetMode: PooledBalanceResetMode.Lazy,
				stripeSubscriptionId: null,
			},
			contributions: {
				count: 3,
				excludedSourceCustomerProductIds: outgoingSourceIds,
			},
			sources: { count: 5 },
		});
		expect(
			getContribution({
				state: after,
				sourceCustomerProductId: unrelatedSource.id,
			}),
		).toMatchObject({
			id: unrelatedContribution.id,
			current_contribution: 100,
			next_cycle_contribution: 100,
		});

		for (const [product, currentContribution] of [
			[incomingPrimary, 150],
			[incomingSecondary, 250],
		] as const) {
			const source = getPooledSourceCustomerProduct({
				state: after,
				productId: product.id,
				entityId: entities[0]!.id,
			});
			expect(
				getContribution({
					state: after,
					sourceCustomerProductId: source.id,
				}),
			).toMatchObject({
				current_contribution: currentContribution,
				next_cycle_contribution: currentContribution,
			});
		}
	},
);
