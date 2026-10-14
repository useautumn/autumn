import type { FreeTrialParamsV1 } from "@api/common/freeTrial/freeTrialParamsV1";

export type FreeTrialParamsSource = {
	customize?: { free_trial?: FreeTrialParamsV1 | null };
	free_trial?: FreeTrialParamsV1 | null;
};

export const resolveFreeTrialParam = (
	params: FreeTrialParamsSource,
): FreeTrialParamsV1 | null | undefined =>
	params.customize?.free_trial !== undefined
		? params.customize.free_trial
		: params.free_trial;
