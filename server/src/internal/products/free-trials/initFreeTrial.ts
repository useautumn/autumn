import {
	type CreateFreeTrial,
	CreateFreeTrialSchema,
	type FreeTrial,
} from "@autumn/shared";
import { generateId } from "@/utils/genUtils";

export const initFreeTrial = ({
	freeTrialParams,
	internalProductId,
	isCustom = false,
}: {
	freeTrialParams: CreateFreeTrial;
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
