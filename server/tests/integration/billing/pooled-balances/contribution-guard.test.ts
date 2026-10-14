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

		await applyPooledBalanceCustomerProductTransitions({
			ctx,
			fullCustomer,
			outgoingCustomerProducts: [],
			incomingCustomerProducts: [contributingCustomerProduct],
			now: Date.now(),
		});

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

		expect(contributionsForSource[0].id).toBe(originalContribution.id);
		expect(contributionsForSource[0].current_contribution).toBe(GRANT);

		expect(afterTransition.pools).toHaveLength(1);
		expect(afterTransition.pools[0].granted).toBe(GRANT);
	},
);
