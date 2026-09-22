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
	const desired = initFreeTrialRow({ freeTrialParams, internalProductId });
	// Not a plan-params field, so a restated trial keeps what the row holds.
	return currentFreeTrial
		? { ...desired, unique_fingerprint: currentFreeTrial.unique_fingerprint }
		: desired;
};

/**
 * Free plans have no card gate, and the read API reports `card_required`
 * false for them; a stored true is inert and must not read as a change.
 */
const comparableFreeTrial = ({
	freeTrial,
	cardRequiredInert,
}: {
	freeTrial: FreeTrial;
	cardRequiredInert: boolean;
}): FreeTrial =>
	cardRequiredInert ? { ...freeTrial, card_required: false } : freeTrial;

/** Pair desired vs current by mode — version never claims/retires the base row. */
const claimFreeTrial = ({
	mode,
	freeTrialParams,
	desired,
	currentFreeTrial,
	internalProductId,
	cardRequiredInert,
}: {
	mode: FreeTrialPlanMode;
	freeTrialParams: FreeTrialParamsV1 | null | undefined;
	desired: FreeTrial | null;
	currentFreeTrial: FreeTrial | null;
	internalProductId: string;
	cardRequiredInert: boolean;
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
		freeTrialsAreSame({
			ft1: comparableFreeTrial({
				freeTrial: currentFreeTrial,
				cardRequiredInert,
			}),
			ft2: comparableFreeTrial({ freeTrial: desired, cardRequiredInert }),
		})
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
	cardRequiredInert = false,
}: {
	freeTrialParams: FreeTrialParamsV1 | null | undefined;
	currentFreeTrial: FreeTrial | null;
	internalProductId: string;
	mode?: FreeTrialPlanMode;
	/** The plan is free: `card_required` has no effect, so it never differs. */
	cardRequiredInert?: boolean;
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
		cardRequiredInert,
	});

	return buildFreeTrialPlan({ claim });
};
