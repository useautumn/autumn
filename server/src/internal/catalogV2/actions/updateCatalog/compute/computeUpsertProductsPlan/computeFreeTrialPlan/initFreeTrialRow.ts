import type { FreeTrial, FreeTrialParamsV1 } from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";

/** Mint a FreeTrial row from V1 params (defaults already applied at parse). */
export const initFreeTrialRow = ({
	freeTrialParams,
	internalProductId,
}: {
	freeTrialParams: FreeTrialParamsV1;
	internalProductId: string;
}): FreeTrial => ({
	id: generateId("ft"),
	duration: freeTrialParams.duration_type,
	length: freeTrialParams.duration_length,
	unique_fingerprint: false,
	created_at: Date.now(),
	internal_product_id: internalProductId,
	is_custom: false,
	card_required: freeTrialParams.card_required,
	on_end: freeTrialParams.on_end ?? null,
});
