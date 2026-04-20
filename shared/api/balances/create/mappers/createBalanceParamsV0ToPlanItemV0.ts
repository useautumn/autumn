import type { CreateBalanceParamsV0 } from "@api/balances/create/createBalanceParams";
import type { ApiPlanItemV0 } from "@api/products/items/previousVersions/apiPlanItemV0";
import {
	featureToResetWhenEnabled,
	findFeatureById,
} from "@utils/featureUtils/index";
import type { SharedContext } from "../../../../types/sharedContext";

export const createBalanceParamsV0ToPlanItemV0 = ({
	ctx,
	params,
}: {
	ctx: SharedContext;
	params: CreateBalanceParamsV0;
}): ApiPlanItemV0 => {
	const feature = findFeatureById({
		features: ctx.features,
		featureId: params.feature_id,
	});

	return {
		feature_id: params.feature_id,
		granted_balance: params.included_grant ?? params.granted_balance ?? 0,
		unlimited: params.unlimited ?? false,
		reset: params.reset
			? {
					interval: params.reset.interval,
					interval_count: params.reset.interval_count,
					reset_when_enabled: featureToResetWhenEnabled({ feature }),
				}
			: null,
		price: null,
		rollover: params.rollover
			? {
					max: params.rollover.max ?? null,
					max_percentage: params.rollover.max_percentage ?? null,
					expiry_duration_type: params.rollover.duration,
					expiry_duration_length: params.rollover.length,
				}
			: undefined,
	};
};
