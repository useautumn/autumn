// const {
// 	fullProducts: [newFullProduct],
// 	customPrices,
// 	customEnts,
// } = await overrideProduct({
// 	ctx,
// 	newItems: body.items,
// 	products: [product],
// });

import type { SubscriptionUpdateV0Params } from "../../../../../../../shared";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import type { UpdateSubscriptionContext } from "../fetch/updateSubscriptionContextSchema";

export const computeSubscriptionUpdateCustomConfigurationPlan = ({
	ctx: AutumnContext,
	updateSubscriptionContext,
	params,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionContext;
	params: SubscriptionUpdateV0Params;
}) => {
	return {};
};
