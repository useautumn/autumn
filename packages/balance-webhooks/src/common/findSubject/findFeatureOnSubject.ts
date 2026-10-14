import type { WorkerFullSubject } from "@autumn/balance-engine";
import type { Feature } from "@autumn/shared";
import { fullSubjectToCustomerEntitlements } from "@autumn/shared";

export const findFeatureOnSubject = ({
	fullSubject,
	featureId,
	now,
}: {
	fullSubject: WorkerFullSubject;
	featureId: string;
	now: number;
}): Feature | undefined =>
	fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: [featureId],
		now,
	})[0]?.entitlement.feature;
