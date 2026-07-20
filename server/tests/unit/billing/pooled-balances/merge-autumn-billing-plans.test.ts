import { expect, test } from "bun:test";
import type {
	AutumnBillingPlan,
	CustomerLicenseTransition,
	PooledBalanceOp,
} from "@autumn/shared";
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

const licenseTransition = ({
	outgoingId,
	incomingId,
	paidQuantity,
}: {
	outgoingId: string;
	incomingId: string;
	paidQuantity: number;
}): CustomerLicenseTransition =>
	({
		outgoingCustomerLicense: { id: outgoingId },
		incomingCustomerLicense: { id: incomingId },
		updates: { paidQuantity },
	}) as CustomerLicenseTransition;

test("incoming license transitions are retained and replace the same transition", () => {
	const retained = licenseTransition({
		outgoingId: "outgoing-retained",
		incomingId: "incoming-retained",
		paidQuantity: 1,
	});
	const replaced = licenseTransition({
		outgoingId: "outgoing-replaced",
		incomingId: "incoming-replaced",
		paidQuantity: 2,
	});
	const replacement = licenseTransition({
		outgoingId: "outgoing-replaced",
		incomingId: "incoming-replaced",
		paidQuantity: 3,
	});

	const merged = mergeAutumnBillingPlans({
		base: {
			...plan([]),
			customerLicenseTransitions: [retained, replaced],
		},
		incoming: {
			...plan([]),
			customerLicenseTransitions: [replacement],
		},
	});

	expect(merged.customerLicenseTransitions).toEqual([retained, replacement]);
});
