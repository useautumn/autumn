import type { ApprovalCustomerFacts } from "@autumn/shared/api/approvals/evaluate/index.js";

/** Facts as the decision log stores them: the customer cut to the fields rules read. */
export const approvalFactsToJson = ({
	facts,
}: {
	facts: object | null;
}): Record<string, unknown> => {
	if (!facts) return {};
	const { customer, ...rest } = facts as {
		customer?: ApprovalCustomerFacts;
	};
	return {
		...rest,
		...(customer && {
			customer: { id: customer.id, has_paid: customer.has_paid },
		}),
	};
};
