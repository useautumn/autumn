import { CreateFeatureSchema, ErrCode } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import type { PlanCopySource } from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { initNewFeature } from "./copyProductForOrgs.js";

/**
 * Inserts the selected source features the target lacks, appending them to
 * toContext.features. Unlike handleCopyFeatures, a plan copy never overwrites
 * a target feature; a same-id different-type feature is a hard conflict.
 */
export const copyMissingFeatures = async ({
	source,
	toContext,
	featureIds,
}: {
	source: PlanCopySource;
	toContext: AutumnContext;
	featureIds: Set<string>;
}): Promise<void> => {
	const { db, logger, org, env, features: toFeatures } = toContext;
	const { features: fromFeatures } = source;

	for (const fromFeature of fromFeatures.filter((f) => featureIds.has(f.id))) {
		const toFeature = toFeatures.find((f) => f.id === fromFeature.id);

		if (toFeature && fromFeature.type !== toFeature.type) {
			throw new RecaseError({
				message: `Feature ${fromFeature.name} exists in ${env} with a different type. Please match them then try again.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		if (!toFeature) {
			const res = await FeatureService.insert({
				db,
				data: initNewFeature({
					data: CreateFeatureSchema.parse(fromFeature),
					orgId: org.id,
					env,
				}),
				logger,
			});
			// Must stay the same array object toContext.features points at — a later
			// copyProduct reads ctx.features and throws on a feature missing here.
			toFeatures.push(res![0]);
		}
	}
};
