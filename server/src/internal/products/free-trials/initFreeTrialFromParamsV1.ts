import type { FreeTrial } from "@autumn/shared";
import type { FreeTrialParamsV1 } from "@shared/api/common/freeTrial/freeTrialParamsV1";
import { generateId } from "@/utils/genUtils";

export const initFreeTrialFromParamsV1 = ({
	freeTrialParams,
	internalProductId,
	isCustom = false,
}: {
	freeTrialParams: FreeTrialParamsV1;
	internalProductId: string;
	isCustom?: boolean;
}): FreeTrial => {
	return {
		id: generateId("ft"),
		created_at: Date.now(),
		internal_product_id: internalProductId,
		is_custom: isCustom,

		duration: freeTrialParams.duration_type,
		length: freeTrialParams.duration_length,
		card_required: freeTrialParams.card_required,
		unique_fingerprint: true,
	};
};
