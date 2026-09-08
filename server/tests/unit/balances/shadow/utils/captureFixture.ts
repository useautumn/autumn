import type {
	BalanceObservation,
	BalanceObservationCapture,
} from "@/internal/balances/shadow/balanceObservation.js";
import { createCustomerFixture } from "../../balanceWorker/customer-fixture.js";

export function createCaptureFixture() {
	const fixture = createCustomerFixture();
	const received: BalanceObservation[] = [];
	const failures: string[] = [];
	const capture: BalanceObservationCapture = {
		select: ({ orgId, env, customerId }) =>
			orgId === fixture.ctx.org.id &&
			env === fixture.ctx.env &&
			customerId === fixture.fullSubject.customerId
				? new Set(["messages"])
				: undefined,
		tryEnqueue: (observation) => {
			received.push(observation);
			return true;
		},
		onUnavailable: ({ reason }) => {
			failures.push(reason);
		},
	};
	const context = {
		orgId: fixture.ctx.org.id,
		env: fixture.ctx.env,
		customerId: fixture.fullSubject.customerId,
		featureId: "messages",
		requestId: fixture.ctx.id,
	};
	const before = {
		customerEntitlementId: fixture.customerEntitlement.id,
		balance: 72,
		adjustment: 10,
		additionalBalance: 0 as const,
		nextResetAt: fixture.customerEntitlement.next_reset_at,
		expiresAt: null,
	};
	const observation: BalanceObservation = {
		...context,
		schemaVersion: 1,
		source: "redis",
		epoch: 0,
		incarnation: "a5da404c-f679-4a72-b454-88d8185cb1c9",
		sequence: "1",
		kind: "deduct",
		decision: "applied",
		requestedValue: 5,
		targetBalance: null,
		overageBehavior: "reject",
		reason: null,
		before,
		after: { ...before, balance: 67 },
	};
	return { ...fixture, capture, context, observation, received, failures };
}
