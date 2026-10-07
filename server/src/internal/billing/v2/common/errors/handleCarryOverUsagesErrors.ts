import {
	type CarryOverUsages,
	ErrCode,
	featureUtils,
	isBooleanFeature,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** Usage only carries onto a plan replacing another now, and only consumable usage carries. */
export const handleCarryOverUsagesErrors = ({
	ctx,
	carryOverUsages,
	replacesPlanNow,
}: {
	ctx: AutumnContext;
	carryOverUsages: CarryOverUsages;
	replacesPlanNow: boolean;
}) => {
	if (!carryOverUsages?.enabled) return;

	if (!replacesPlanNow) {
		throw new RecaseError({
			message:
				"carry_over_usages is only supported for immediate plan switches (upgrades). It cannot be used with scheduled downgrades.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const featureIds = carryOverUsages.feature_ids;
	if (!featureIds?.length) return;

	for (const featureId of featureIds) {
		const feature = featureUtils.find.byId({
			features: ctx.features,
			featureId,
			errorOnNotFound: true,
		});

		if (isBooleanFeature({ feature })) {
			throw new RecaseError({
				message: `carry_over_usages is not supported for boolean features. Feature '${featureId}' is a boolean (static) feature and does not have a consumable usage.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		if (featureUtils.isAllocated(feature)) {
			throw new RecaseError({
				message: `carry_over_usages is not supported for non-consumable features. Feature '${featureId}' is a non-consumable (allocated) feature and does not have a consumable usage to carry over.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}
};
