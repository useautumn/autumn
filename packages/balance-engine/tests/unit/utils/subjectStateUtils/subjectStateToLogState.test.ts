import { describe, expect, test } from "bun:test";
import { AppEnv, CollectionMethod } from "@autumn/shared";
import {
	createSubjectState,
	subjectStateToLogState,
} from "../../../../src/balanceEngine.js";
import { createCustomerProduct, identity } from "../../engineFixtures.js";

const decisionColumns = {
	internal_id: "cus_internal_1",
	id: identity.customerId,
	config: null,
	spend_limits: null,
	overage_allowed: null,
	usage_limits: null,
	usage_alerts: null,
};

const state = createSubjectState({
	identity,
	customer: {
		...decisionColumns,
		org_id: identity.orgId,
		env: AppEnv.Sandbox,
		created_at: 1_700_000_000_000,
		name: "Ada",
		email: "ada@example.com",
		processor: { type: "stripe", id: "cus_stripe_1" },
		metadata: { plan: "team" },
		send_email_receipts: false,
	},
	customerProducts: [
		{
			...createCustomerProduct(),
			product_id: "pro",
			subscription_ids: ["sub_1"],
			trial_ends_at: 1_800_000_000_000,
			collection_method: CollectionMethod.ChargeAutomatically,
		},
	],
});

describe("subject state to log state", () => {
	test("the log keeps the columns commands decide on and drops what only customers.get renders", () => {
		const logged = subjectStateToLogState({ state });

		expect(logged.customer).toEqual(decisionColumns);
		expect(logged.customerProducts).toEqual([createCustomerProduct()]);
		expect(logged.customerEntitlements).toEqual(state.customerEntitlements);
	});

	test("memory's copy keeps the whole rows", () => {
		subjectStateToLogState({ state });

		expect(state.customer.name).toBe("Ada");
		expect(state.customerProducts[0]?.subscription_ids).toEqual(["sub_1"]);
	});
});
