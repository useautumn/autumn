import type { SharedContext } from "../../../../types/sharedContext";
import { itemToPriceAndEnt } from "../../../../utils/productV2Utils/productItemUtils/mappers/itemToPriceAndEnt";
import { attachItemCurrencies } from "../../mappers/attachItemCurrencies";
import type { CreatePlanItemParamsV1 } from "../crud/createPlanItemParamsV1";
import { planItemV0ToProductItem } from "./planItemV0ToProductItem";
import { planItemV1ToV0 } from "./planItemV1ToV0";

export const planItemV1ToPriceAndEnt = ({
	ctx,
	item,
	orgId,
	internalProductId,
	isCustom,
}: {
	ctx: SharedContext;
	item: CreatePlanItemParamsV1;
	orgId: string;
	internalProductId?: string;
	isCustom: boolean;
}) => {
	const planItemV0 = planItemV1ToV0({ ctx, item });
	const productItem = attachItemCurrencies({
		ctx,
		productItem: planItemV0ToProductItem({ ctx, planItem: planItemV0 }),
		planItem: item,
	});
	const feature = ctx.features.find(
		(feature) => feature.id === item.feature_id,
	);

	return itemToPriceAndEnt({
		item: productItem,
		orgId,
		internalProductId,
		feature,
		isCustom,
		features: ctx.features,
	});
};
