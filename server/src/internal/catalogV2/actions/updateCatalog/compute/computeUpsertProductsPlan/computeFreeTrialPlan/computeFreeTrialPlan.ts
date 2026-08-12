import {
	type FreeTrial,
	type FreeTrialParamsV1,
	freeTrialsAreSame,
} from "@autumn/shared";
import type { FreeTrialPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { initFreeTrialRow } from "./initFreeTrialRow";

/**
 * Claim-style free-trial planner: omit preserves, null retires, object mints
 * unless the current row matches (then claim same id).
 */
export const computeFreeTrialPlan = ({
	freeTrialParams,
	currentFreeTrial,
	internalProductId,
}: {
	freeTrialParams: FreeTrialParamsV1 | null | undefined;
	currentFreeTrial: FreeTrial | null;
	internalProductId: string;
}): FreeTrialPlan => {
	if (freeTrialParams === undefined) {
		return {
			changed: false,
			new: null,
			same: currentFreeTrial,
			retired: null,
			projected: currentFreeTrial,
		};
	}

	if (freeTrialParams === null) {
		return {
			changed: currentFreeTrial !== null,
			new: null,
			same: null,
			retired: currentFreeTrial,
			projected: null,
		};
	}

	const desired = initFreeTrialRow({
		freeTrialParams,
		internalProductId,
	});

	if (
		currentFreeTrial &&
		freeTrialsAreSame({ ft1: currentFreeTrial, ft2: desired })
	) {
		return {
			changed: false,
			new: null,
			same: currentFreeTrial,
			retired: null,
			projected: currentFreeTrial,
		};
	}

	return {
		changed: true,
		new: desired,
		same: null,
		retired: currentFreeTrial,
		projected: desired,
	};
};
