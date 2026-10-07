import { expect } from "bun:test";
import { type ApiCustomerV5, CustomerExpand } from "@autumn/shared";
import {
	type PollableExpectParams,
	pollableCustomerExpect,
} from "@tests/utils/pollableCustomerExpect.js";

type TrialsUsedExpectParams = PollableExpectParams<ApiCustomerV5> & {
	planIds: string[];
};

const assertTrialsUsedCorrect = ({
	customer,
	planIds,
}: TrialsUsedExpectParams & { customer: ApiCustomerV5 }) => {
	const usedPlanIds = (customer.trials_used ?? [])
		.map((trial) => trial.plan_id)
		.sort();

	expect(usedPlanIds).toEqual([...planIds].sort());
};

/** Asserts `trials_used` lists exactly `planIds`; pass `customerId` to poll. */
export const expectTrialsUsedCorrect = pollableCustomerExpect({
	fetchCustomer: async ({ customerId, autumn }: TrialsUsedExpectParams) => {
		if (!autumn) throw new Error("expectTrialsUsedCorrect needs `autumn`");
		return await autumn.customers.get<ApiCustomerV5>(customerId ?? "", {
			expand: [CustomerExpand.TrialsUsed],
		});
	},
	assert: assertTrialsUsedCorrect,
});
