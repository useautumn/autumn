import type { FreeTrialParamsV0 } from "@api/common/freeTrial/freeTrialParamsV0";
import type { FreeTrialParamsV1 } from "@api/common/freeTrial/freeTrialParamsV1";

export const freeTrialParamsV1ToV0 = ({
	freeTrialParamsV1,
}: {
	freeTrialParamsV1: FreeTrialParamsV1 | null | undefined;
}): FreeTrialParamsV0 | null | undefined => {
	if (freeTrialParamsV1 === undefined) return undefined;
	if (freeTrialParamsV1 === null) return null;

	return {
		length: freeTrialParamsV1.duration_length,
		duration: freeTrialParamsV1.duration_type,
		card_required: freeTrialParamsV1.card_required,
		on_end: freeTrialParamsV1.on_end,
	};
};
