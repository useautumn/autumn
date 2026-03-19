import {
	type AttachBillingContext,
	BillingInterval,
	BillingType,
	ErrCode,
	getBillingType,
	priceToFeature,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * Validates one-off prepaid constraints on scheduled switches.
 *
 * Throws when:
 * - planTiming is "end_of_cycle" (scheduled switch / downgrade)
 * - AND the user passed a non-zero quantity for a one-off prepaid price
 *
 * Scheduled switches don't add one-off prices to the next invoice,
 * so we block explicit one-off prepaid quantities until that's supported.
 */
export const handleScheduledSwitchOneOffErrors = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: AttachBillingContext;
}) => {
	const { planTiming, attachProduct, featureQuantities } = billingContext;

	if (planTiming !== "end_of_cycle") return;

	for (const price of attachProduct.prices) {
		const isOneOffPrepaid =
			getBillingType(price.config) === BillingType.UsageInAdvance &&
			price.config.interval === BillingInterval.OneOff;

		if (!isOneOffPrepaid) continue;

		const feature = priceToFeature({ price, features: ctx.features });

		if (!feature) continue;

		const matchingOption = featureQuantities.find(
			(fq) =>
				fq.feature_id === feature.id ||
				fq.internal_feature_id === feature.internal_id,
		);

		if (matchingOption && matchingOption.quantity > 0) {
			throw new RecaseError({
				message:
					"Scheduled switch with one-off prepaid quantities is not yet supported. Either use an immediate switch, or omit the one-off prepaid quantity (it will default to 0).",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}
};
