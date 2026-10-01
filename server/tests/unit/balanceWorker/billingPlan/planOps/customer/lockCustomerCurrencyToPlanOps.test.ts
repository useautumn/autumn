import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeApplyBillingPlan,
	createSubjectState,
} from "@autumn/balance-engine";
import { lockCustomerCurrencyToPlanOps } from "@/internal/balanceWorker/billingPlan/planOps/customer/lockCustomerCurrencyToPlanOps.js";
import { newCustomer, planOf } from "../../billingPlanFixtures.js";

const lockOps = ({ currency }: { currency: string }) =>
	lockCustomerCurrencyToPlanOps({
		autumnBillingPlan: planOf({
			lockCustomerCurrency: {
				internalCustomerId: newCustomer.internal_id,
				currency,
			},
		}),
	});

/** The currency the engine leaves on a customer holding `currency` after the lock ops run. */
const currencyAfterLock = ({
	currency,
	lockTo,
}: {
	currency: string | null;
	lockTo: string;
}) => {
	const identity = {
		orgId: newCustomer.org_id,
		env: newCustomer.env,
		customerId: newCustomer.internal_id,
		entityId: null,
	};
	const state = createSubjectState({
		identity,
		customer: {
			internal_id: newCustomer.internal_id,
			id: newCustomer.internal_id,
			config: null,
			spend_limits: null,
			overage_allowed: null,
			usage_limits: null,
			currency,
		},
	});
	const mutation = computeApplyBillingPlan({
		command: {
			schemaVersion: 1,
			type: "applyBillingPlan",
			commandId: "plan_lock",
			requestId: "req_plan_lock",
			identity,
			occurredAt: 1_700_000_000_000,
			entityIds: [],
			ops: lockOps({ currency: lockTo }),
			expiringPooledBalanceIds: [],
		},
		state,
	});
	return applyMutation({ state, mutation }).customer.currency;
};

describe("lockCustomerCurrencyToPlanOps", () => {
	test("a plan that locks no currency changes nothing", () => {
		expect(
			lockCustomerCurrencyToPlanOps({ autumnBillingPlan: planOf({}) }),
		).toEqual([]);
	});

	test("a lock sets the currency", () => {
		expect(lockOps({ currency: "eur" })).toEqual([
			{
				op: "update",
				table: "customer",
				id: newCustomer.internal_id,
				set: { currency: "eur" },
			},
		]);
	});

	test("a lock on a customer with no currency sets it", () => {
		expect(currencyAfterLock({ currency: null, lockTo: "eur" })).toBe("eur");
	});

	test("a lock on a customer with a leftover currency relocks it, as the Postgres path does", () => {
		expect(currencyAfterLock({ currency: "usd", lockTo: "eur" })).toBe("eur");
	});
});
