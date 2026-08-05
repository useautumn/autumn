/**
 * TDD test for the defensive half of the
 * `unique_pooled_balance_contribution` incident.
 *
 * The root cause (a past_due -> active recovery being classified as an incoming
 * attachment) is fixed in classifyPooledBalanceTransitionProducts and covered by
 * tests/unit/billing/classify-pooled-balance-transition-products.test.ts. This
 * file covers the guard behind it: if some OTHER caller mis-classifies an
 * already-contributing product as incoming in future, the request must degrade
 * rather than fail outright.
 *
 * It therefore simulates the mis-classification by passing an already-active,
 * already-contributing customer product as incoming. That is deliberate — with
 * the classification fixed there is no longer a natural trigger, and the guard
 * exists precisely for the case we have not thought of.
 *
 * Red-failure mode (before the guard):
 *  - the transition throws `duplicate key value violates unique constraint
 *    "unique_pooled_balance_contribution"` and the caller's request fails.
 *
 * Green-success criteria (after the guard):
 *  - the transition resolves, the source keeps exactly ONE contribution row,
 *    and that row carries the freshly computed values.
 */

import { expect, test } from "bun:test";
import { ALL_STATUSES } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { applyPooledBalanceCustomerProductTransitions } from "@/internal/billing/v2/pooledBalances/execute/applyPooledBalanceCustomerProductTransitions";
import { CusService } from "@/internal/customers/CusService";
import { getPooledBalanceDbState } from "./utils/getPooledBalanceDbState.js";

const GRANT = 500;

test(
	chalk.yellowBright(
		"pooled contribution guard: re-admitting an already-contributing product does not fail the request",
	),
	async () => {
		const customerId = "pooled-contribution-guard";
		const plan = products.pro({
			id: `${customerId}-plan`,
			items: [
				{ ...items.monthlyMessages({ includedUsage: GRANT }), pooled: true },
			],
		});

		const { entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
		});

		const baseline = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(baseline.pools).toHaveLength(1);
		expect(baseline.contributions).toHaveLength(1);
		const originalContribution = baseline.contributions[0];

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});
		const contributingCustomerProduct = fullCustomer.customer_products.find(
			(customerProduct) =>
				customerProduct.product_id === plan.id &&
				customerProduct.entity_id === entities[0].id,
		);
		if (!contributingCustomerProduct) {
			throw new Error("expected the contributing customer product");
		}

		// ── Act: hand the transition a product that is already contributing, the
		// shape a mis-classification produces. Nothing is outgoing, so there is
		// no delete for the planner to reconcile the insert against.
		await applyPooledBalanceCustomerProductTransitions({
			ctx,
			fullCustomer,
			outgoingCustomerProducts: [],
			incomingCustomerProducts: [contributingCustomerProduct],
			now: Date.now(),
		});

		// ── Contract: the source still holds exactly one contribution ──
		const afterTransition = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		const contributionsForSource = afterTransition.contributions.filter(
			(contribution) =>
				contribution.source_customer_entitlement_id ===
				originalContribution.source_customer_entitlement_id,
		);
		expect(contributionsForSource).toHaveLength(1);

		// ── Contract: reconciled onto the pre-existing row, not a new one ──
		expect(contributionsForSource[0].id).toBe(originalContribution.id);
		expect(contributionsForSource[0].current_contribution).toBe(GRANT);

		// ── Contract: the pool is not double-counted ──
		expect(afterTransition.pools).toHaveLength(1);
		expect(afterTransition.pools[0].granted).toBe(GRANT);
	},
);
