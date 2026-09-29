import type { WorkerFullSubject } from "@autumn/balance-engine";
import {
	type ApiBalanceV1,
	findFeatureById,
	fullSubjectToCustomerEntitlements,
	fullSubjectToRelevantFeatures,
	isBooleanFeature,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { workerStateToApiBalance } from "./workerStateToApiBalance.js";

/** A boolean feature is a flag, never a balance, as on the legacy subject. */
export const isFlagFeatureId = ({
	ctx,
	featureId,
}: {
	ctx: Pick<AutumnContext, "features">;
	featureId: string;
}): boolean => {
	const feature = findFeatureById({ features: ctx.features, featureId });
	return feature ? isBooleanFeature({ feature }) : false;
};

/** The subject holds a grant for the feature; legacy reports no balance, not an error, when it does not. */
export const isFeatureHeld = ({
	fullSubject,
	featureId,
}: {
	fullSubject: WorkerFullSubject;
	featureId: string;
}): boolean =>
	fullSubjectToCustomerEntitlements({ fullSubject, featureIds: [featureId] })
		.length > 0;

/** The legacy `balances` map: each tracked feature and the credit systems that can fund it, null where the customer holds none. */
export const workerSubjectsToApiBalances = ({
	ctx,
	subjects,
}: {
	ctx: AutumnContext;
	subjects: { featureId: string; fullSubject: WorkerFullSubject }[];
}): Record<string, ApiBalanceV1 | null> => {
	const balances: Record<string, ApiBalanceV1 | null> = {};
	for (const { featureId, fullSubject } of subjects) {
		const relevantFeatures = fullSubjectToRelevantFeatures({
			fullSubject,
			featureId,
			features: ctx.features,
		});
		for (const feature of relevantFeatures) {
			const hasBalance =
				!isBooleanFeature({ feature }) &&
				isFeatureHeld({ fullSubject, featureId: feature.id });
			balances[feature.id] = hasBalance
				? workerStateToApiBalance({ ctx, fullSubject, featureId: feature.id })
				: null;
		}
	}
	return balances;
};
