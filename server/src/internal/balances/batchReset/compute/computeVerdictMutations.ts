import type { ResetVerdict, VerdictMutations } from "../types.js";

export const computeVerdictMutations = ({
	verdicts,
}: {
	verdicts: ResetVerdict[];
}): VerdictMutations => ({
	expireCustomerEntitlementIds: verdicts.flatMap((verdict) =>
		verdict.kind === "should_expire" ? [verdict.customerEntitlementId] : [],
	),
	resetByInvoiceCustomerEntitlementIds: verdicts.flatMap((verdict) =>
		verdict.kind === "resets_via_invoice"
			? [verdict.customerEntitlementId]
			: [],
	),
});
