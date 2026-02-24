import {
	FreeTrialDuration,
	type FrontendProduct,
	type ProductItem,
} from "@autumn/shared";
import { getFreeTrial } from "@/components/forms/update-subscription-v2/utils/getFreeTrial";

interface TrialConfig {
	length: number;
	duration: string;
	card_required: boolean;
}

export interface SupportedPlanFormValues {
	items: ProductItem[] | null;
	version: number | undefined;
	trialLength: number | null;
	trialDuration: FreeTrialDuration;
	trialEnabled: boolean;
	trialCardRequired: boolean;
	removeTrial?: boolean;
}

export interface SupportedPlanFormPatch {
	items?: ProductItem[] | null;
	version?: number | undefined;
	trialLength?: number | null;
	trialDuration?: FreeTrialDuration;
	trialEnabled?: boolean;
	trialCardRequired?: boolean;
	removeTrial?: boolean;
}

const normalizeItems = ({ items }: { items?: ProductItem[] | null }) => {
	return structuredClone(items ?? []);
};

const areItemsEqual = ({
	left,
	right,
}: {
	left?: ProductItem[] | null;
	right?: ProductItem[] | null;
}) => {
	return (
		JSON.stringify(normalizeItems({ items: left })) ===
		JSON.stringify(normalizeItems({ items: right }))
	);
};

export const areTrialConfigsEqual = ({
	leftTrial,
	rightTrial,
}: {
	leftTrial: TrialConfig | null | undefined;
	rightTrial: TrialConfig | null | undefined;
}) => {
	if (!leftTrial && !rightTrial) return true;
	if (!leftTrial || !rightTrial) return false;

	return (
		Number(leftTrial.length) === Number(rightTrial.length) &&
		String(leftTrial.duration) === String(rightTrial.duration) &&
		Boolean(leftTrial.card_required) === Boolean(rightTrial.card_required)
	);
};

export const getProductWithSupportedPlanFormValues = ({
	baseProduct,
	formValues,
}: {
	baseProduct: FrontendProduct;
	formValues: SupportedPlanFormValues;
}): FrontendProduct => {
	const freeTrial = getFreeTrial({
		removeTrial: formValues.removeTrial ?? false,
		trialLength: formValues.trialLength,
		trialDuration: formValues.trialDuration,
		trialEnabled: formValues.trialEnabled,
		trialCardRequired: formValues.trialCardRequired,
	});

	const freeTrialValue =
		freeTrial === null ? null : (freeTrial ?? baseProduct.free_trial ?? null);

	return {
		...baseProduct,
		items: formValues.items ?? baseProduct.items,
		free_trial: freeTrialValue,
		version: formValues.version ?? baseProduct.version,
	};
};

export const getSupportedPlanFormPatchFromDraftProduct = ({
	baseProduct,
	draftProduct,
	isCurrentlyTrialing = false,
	includeRemoveTrial = false,
}: {
	baseProduct: FrontendProduct;
	draftProduct: FrontendProduct;
	isCurrentlyTrialing?: boolean;
	includeRemoveTrial?: boolean;
}): SupportedPlanFormPatch => {
	const patch: SupportedPlanFormPatch = {};

	if (!areItemsEqual({ left: baseProduct.items, right: draftProduct.items })) {
		patch.items = draftProduct.items;
	}

	if (draftProduct.version !== baseProduct.version) {
		patch.version = draftProduct.version;
	}

	const baseTrial = baseProduct.free_trial ?? null;
	const draftTrial = draftProduct.free_trial ?? null;

	if (!areTrialConfigsEqual({ leftTrial: baseTrial, rightTrial: draftTrial })) {
		if (draftTrial) {
			patch.trialEnabled = true;
			patch.trialLength = Number(draftTrial.length);
			patch.trialDuration = draftTrial.duration as FreeTrialDuration;
			patch.trialCardRequired = Boolean(draftTrial.card_required);
			if (includeRemoveTrial) {
				patch.removeTrial = false;
			}
		} else {
			patch.trialEnabled = false;
			patch.trialLength = baseTrial ? Number(baseTrial.length) : null;
			patch.trialDuration = (baseTrial?.duration ??
				FreeTrialDuration.Day) as FreeTrialDuration;
			patch.trialCardRequired = baseTrial
				? Boolean(baseTrial.card_required)
				: true;
			if (includeRemoveTrial) {
				patch.removeTrial = isCurrentlyTrialing;
			}
		}
	}

	return patch;
};
