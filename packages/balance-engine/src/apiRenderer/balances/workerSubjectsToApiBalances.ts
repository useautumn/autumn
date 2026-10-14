import {
	type ApiBalanceV1,
	findFeatureById,
	fullSubjectToCustomerEntitlements,
	fullSubjectToRelevantFeatures,
	isBooleanFeature,
	type SharedContext,
} from "@autumn/shared";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { workerStateToApiBalance } from "./workerStateToApiBalance.js";

export const isFlagFeatureId = ({
	ctx,
	featureId,
}: {
	ctx: Pick<SharedContext, "features">;
	featureId: string;
}): boolean => {
	const feature = findFeatureById({ features: ctx.features, featureId });
	return feature ? isBooleanFeature({ feature }) : false;
};

export const isFeatureHeld = ({
	fullSubject,
	featureId,
}: {
	fullSubject: WorkerFullSubject;
	featureId: string;
}): boolean =>
	fullSubjectToCustomerEntitlements({ fullSubject, featureIds: [featureId] })
		.length > 0;

export const workerSubjectsToApiBalances = ({
	ctx,
	subjects,
}: {
	ctx: SharedContext;
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
