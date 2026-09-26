import {
	usageWindowFeaturesOf,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import {
	fullSubjectToCustomerEntitlements,
	type UsageWindowFeature,
} from "@autumn/shared";

/** The features a cap on this feature resolves from, as the engine's draw sees them: credit-only funding included. */
export const fullSubjectToUsageWindowFeatures = ({
	fullSubject,
	featureId,
	internalFeatureId,
	now,
}: {
	fullSubject: WorkerFullSubject;
	featureId: string;
	internalFeatureId: string;
	now: number;
}): UsageWindowFeature[] =>
	usageWindowFeaturesOf({
		featureId,
		internalFeatureId,
		customerEntitlements: fullSubjectToCustomerEntitlements({
			fullSubject,
			fundsFeatureId: featureId,
			now,
		}),
	});
