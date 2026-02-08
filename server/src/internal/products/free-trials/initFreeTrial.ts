import {
	type CreateFreeTrial,
	CreateFreeTrialSchema,
	type FreeTrial,
} from "@autumn/shared";
import type { FreeTrialParamsV0 } from "@shared/api/billing/common/freeTrial/freeTrialParamsV0";
import { generateId } from "@/utils/genUtils";

export const initFreeTrial = ({
	freeTrialParams,
	internalProductId,
	isCustom = false,
}: {
	freeTrialParams: CreateFreeTrial | FreeTrialParamsV0;
	internalProductId: string;
	isCustom?: boolean;
}): FreeTrial => {
	const parsedFreeTrialParams = CreateFreeTrialSchema.parse(freeTrialParams);

	return {
		...parsedFreeTrialParams,
		id: generateId("ft"),
		created_at: Date.now(),
		internal_product_id: internalProductId,
		is_custom: isCustom,
	};
};
