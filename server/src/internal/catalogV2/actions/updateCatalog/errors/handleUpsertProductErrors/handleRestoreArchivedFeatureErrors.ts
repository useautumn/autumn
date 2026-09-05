import { ErrCode, type Feature, RecaseError } from "@autumn/shared";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

const isRestoringPlan = ({ upsert }: { upsert: UpsertProductPlan }): boolean =>
	upsert.row.currentFullProduct?.archived === true &&
	upsert.row.nextFullProduct.archived === false;

/** A restored plan cannot keep items on a feature this push still leaves archived. */
export const handleRestoreArchivedFeatureErrors = ({
	upsert,
	projectedFeatures,
}: {
	upsert: UpsertProductPlan;
	projectedFeatures: Feature[];
}): void => {
	if (!isRestoringPlan({ upsert })) return;

	const featureByInternalId = new Map(
		projectedFeatures.map((feature) => [feature.internal_id, feature]),
	);
	for (const entitlement of upsert.row.nextFullProduct.entitlements) {
		const feature = featureByInternalId.get(entitlement.internal_feature_id);
		if (!feature?.archived) continue;
		throw new RecaseError({
			message: `Feature ${feature.id} is archived. Unarchive it in the same push, or before restoring plan ${upsert.row.planId}.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
