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
	return currentFreeTrial
		? { ...desired, unique_fingerprint: currentFreeTrial.unique_fingerprint }
		: desired;
};

const comparableFreeTrial = ({
	freeTrial,
	cardRequiredInert,
}: {
	freeTrial: FreeTrial;
	cardRequiredInert: boolean;
}): FreeTrial =>
	cardRequiredInert ? { ...freeTrial, card_required: false } : freeTrial;

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
