import {
	type FreeTrial,
	type FreeTrialParamsV1,
	freeTrialsAreSame,
} from "@autumn/shared";
import type { FreeTrialPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { buildFreeTrialPlan } from "./buildFreeTrialPlan";
import { copyFreeTrialToProduct } from "./copyFreeTrialToProduct";
import { initFreeTrialRow } from "./initFreeTrialRow";

export type FreeTrialPlanMode = { type: "update" } | { type: "version" };

/** Expand free_trial params into the desired row content. */
const resolveDesiredFreeTrial = ({
	freeTrialParams,
	currentFreeTrial,
	internalProductId,
}: {
	freeTrialParams: FreeTrialParamsV1 | null | undefined;
	currentFreeTrial: FreeTrial | null;
	internalProductId: string;
}): FreeTrial | null => {
	if (freeTrialParams === undefined) return currentFreeTrial;
	if (freeTrialParams === null) return null;
	return initFreeTrialRow({ freeTrialParams, internalProductId });
};

/** Pair desired vs current by mode — version never claims/retires the base row. */
const claimFreeTrial = ({
	mode,
	freeTrialParams,
	desired,
	currentFreeTrial,
	internalProductId,
}: {
	mode: FreeTrialPlanMode;
	freeTrialParams: FreeTrialParamsV1 | null | undefined;
	desired: FreeTrial | null;
	currentFreeTrial: FreeTrial | null;
	internalProductId: string;
}): {
	new?: FreeTrial | null;
	same?: FreeTrial | null;
	retired?: FreeTrial | null;
} => {
	if (mode.type === "version") {
		if (!desired) return {};
		return {
			new: copyFreeTrialToProduct({
				freeTrial: desired,
				internalProductId,
			}),
		};
	}

	if (freeTrialParams === undefined) {
		return { same: currentFreeTrial };
	}

	if (desired == null) {
		return { retired: currentFreeTrial };
	}

	if (
		currentFreeTrial &&
		freeTrialsAreSame({ ft1: currentFreeTrial, ft2: desired })
	) {
		return { same: currentFreeTrial };
	}

	return { new: desired, retired: currentFreeTrial };
};

/** Resolve desired → claim by mode → bucket plan. */
export const computeFreeTrialPlan = ({
	freeTrialParams,
	currentFreeTrial,
	internalProductId,
	mode = { type: "update" },
}: {
	freeTrialParams: FreeTrialParamsV1 | null | undefined;
	currentFreeTrial: FreeTrial | null;
	internalProductId: string;
	mode?: FreeTrialPlanMode;
}): FreeTrialPlan => {
	const desired = resolveDesiredFreeTrial({
		freeTrialParams,
		currentFreeTrial,
		internalProductId,
	});

	const claim = claimFreeTrial({
		mode,
		freeTrialParams,
		desired,
		currentFreeTrial,
		internalProductId,
	});

	return buildFreeTrialPlan({ claim });
};
