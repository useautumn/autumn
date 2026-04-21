import type { Organization } from "@autumn/shared";
import { getSkipOverageSubmissionCustomers } from "./featureFlagStore.js";

/** Edge config per-customer override > org config flag > false. Fully synchronous. */
export const parseSkipOverageSubmissionFlag = ({
	org,
	customerId,
}: {
	org: Organization;
	customerId: string | null | undefined;
}): boolean => {
	if (customerId) {
		const customerIds = getSkipOverageSubmissionCustomers({ orgId: org.id });
		if (customerIds.includes(customerId)) return true;
	}

	return org.config.skip_overage_submission;
};
