import type { FreeTrial } from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";

export const copyFreeTrialToProduct = ({
	freeTrial,
	internalProductId,
}: {
	freeTrial: FreeTrial;
	internalProductId: string;
}): FreeTrial => ({
	...freeTrial,
	id: generateId("ft"),
	created_at: Date.now(),
	internal_product_id: internalProductId,
	is_custom: false,
});
