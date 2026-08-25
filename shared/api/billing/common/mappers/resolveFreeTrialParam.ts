import type { FreeTrialParamsV1 } from "@api/common/freeTrial/freeTrialParamsV1";

/** The trial is documented at the top level of a billing request and defined
 * inside `customize`; every consumer must read both or a documented request
 * silently loses its trial. `customize.free_trial` wins when both are given. */
export const resolveFreeTrialParam = (params: {
	customize?: { free_trial?: FreeTrialParamsV1 | null };
	free_trial?: FreeTrialParamsV1 | null;
}): FreeTrialParamsV1 | null | undefined =>
	params.customize?.free_trial !== undefined
		? params.customize.free_trial
		: params.free_trial;
