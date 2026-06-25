import { freeTrialParamsV0ToV1 } from "@api/common/freeTrial/mappers/freeTrialParamsV0ToV1";
import type { ProductItem } from "@models/productV2Models/productItemModels/productItemModels";
import { productItemsToCustomizePlanV1 } from "@utils/productV2Utils/productItemUtils/convertProductItem/productItemsToCustomizePlanV1";
import type { SharedContext } from "../../../../types/sharedContext";
import type { FreeTrialParamsV0 } from "../../../common/freeTrial/freeTrialParamsV0";
import type { CustomizePlanV1 } from "../customizePlan/customizePlanV1";

/** Maps the V0 top-level customization fields (items, free_trial, billing_controls) into a CustomizePlanV1. */
export const billingParamsV0ToCustomizeV1 = ({
	ctx,
	items,
	freeTrial,
	billingControls,
}: {
	ctx: SharedContext;
	items?: ProductItem[];
	freeTrial?: FreeTrialParamsV0 | null;
	billingControls?: CustomizePlanV1["billing_controls"];
}): CustomizePlanV1 | undefined => {
	const itemsCustomize = items
		? productItemsToCustomizePlanV1({ ctx, items })
		: undefined;
	const freeTrialV1 = freeTrialParamsV0ToV1({ freeTrialParamsV0: freeTrial });

	const hasCustomization =
		itemsCustomize !== undefined ||
		freeTrialV1 !== undefined ||
		billingControls !== undefined;

	if (!hasCustomization) return undefined;

	return {
		...itemsCustomize,
		free_trial: freeTrialV1,
		billing_controls: billingControls,
	};
};
