import type { AttachBillingContext, AttachParamsV1 } from "@autumn/shared";
import {
	ErrCode,
	featureUtils,
	isBooleanFeature,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * Validates carry_over_balances params.
 *
 * - Only valid for immediate switches — errors on scheduled/downgrade.
 * - Boolean and allocated (continuous_use) features cannot have balances carried over.
 */
export const handleCarryOverBalancesErrors = ({
	ctx,
	params,
	billingContext,
}: {
	ctx: AutumnContext;
	params: AttachParamsV1;
	billingContext: AttachBillingContext;
}) => {
	const carryOver = params.carry_over_balances;
	if (!carryOver?.enabled) return;

	if (billingContext.planTiming !== "immediate") {
		throw new RecaseError({
			message:
				"carry_over_balances is only supported for immediate plan switches (upgrades). It cannot be used with scheduled downgrades.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const featureIds = carryOver.feature_ids;
	if (!featureIds?.length) return;

	for (const featureId of featureIds) {
		const feature = featureUtils.find.byId({
			features: ctx.features,
			featureId,
			errorOnNotFound: true,
		});

		if (isBooleanFeature({ feature })) {
			throw new RecaseError({
				message: `carry_over_balances is not supported for boolean features. Feature '${featureId}' is a boolean (static) feature and does not have a consumable balance.`,
			});
		}

		if (featureUtils.isAllocated(feature)) {
			throw new RecaseError({
				message: `carry_over_balances is not supported for non-consumable features. Feature '${featureId}' is a non-consumable feature and does not have a consumable balance to carry over.`,
			});
		}
	}
};
