import { expect, test } from "bun:test";
import type { AutumnBillingPlan, PooledBalanceOp } from "@autumn/shared";
import { mergeAutumnBillingPlans } from "@/internal/billing/v2/utils/billingPlan/mergeAutumnBillingPlans.js";

const removeSource = ({
	sourceCustomerProductId,
	effectiveAt,
}: {
	sourceCustomerProductId: string;
	effectiveAt: number;
}): PooledBalanceOp => ({
	op: "remove_source",
	internalCustomerId: "internal-customer",
	sourceCustomerProductId,
	effectiveAt,
});

const plan = (pooledBalanceOps: PooledBalanceOp[]): AutumnBillingPlan => ({
	customerId: "customer",
	insertCustomerProducts: [],
	pooledBalanceOps,
});

test("incoming pooled operations keep their declared order when replacing base operations", () => {
	const merged = mergeAutumnBillingPlans({
		base: plan([
			removeSource({ sourceCustomerProductId: "source-c", effectiveAt: 1 }),
			removeSource({ sourceCustomerProductId: "source-a", effectiveAt: 1 }),
			removeSource({ sourceCustomerProductId: "source-b", effectiveAt: 1 }),
		]),
		incoming: plan([
			removeSource({ sourceCustomerProductId: "source-b", effectiveAt: 2 }),
			removeSource({ sourceCustomerProductId: "source-a", effectiveAt: 2 }),
		]),
	});

	expect(
		merged.pooledBalanceOps?.map((operation) => ({
			sourceCustomerProductId:
				"sourceCustomerProductId" in operation
					? operation.sourceCustomerProductId
					: undefined,
			effectiveAt:
				"effectiveAt" in operation ? operation.effectiveAt : undefined,
		})),
	).toEqual([
		{ sourceCustomerProductId: "source-c", effectiveAt: 1 },
		{ sourceCustomerProductId: "source-b", effectiveAt: 2 },
		{ sourceCustomerProductId: "source-a", effectiveAt: 2 },
	]);
});
