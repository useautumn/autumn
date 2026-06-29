import {
	customizePlanV1DiffsEqual,
	type DiffedCustomizePlanV1,
	ErrCode,
	RecaseError,
} from "@autumn/shared";

export type VariantUpdateSource = "direct" | "propagated";

export const variantCustomizeChanged = ({
	currentCustomize,
	incomingCustomize,
}: {
	currentCustomize?: DiffedCustomizePlanV1 | null;
	incomingCustomize: DiffedCustomizePlanV1;
}): boolean =>
	!customizePlanV1DiffsEqual({
		left: currentCustomize,
		right: incomingCustomize,
	});

export const validateDirectVariantControls = ({
	isDirect,
	variantPlanId,
	hasControls,
}: {
	isDirect: boolean;
	variantPlanId: string;
	hasControls: boolean;
}) => {
	if (isDirect || !hasControls) return;

	throw new RecaseError({
		message: `Variant ${variantPlanId} versioning and migration fields can only be used when its customize changes.`,
		code: ErrCode.InvalidPropagationTarget,
		statusCode: 400,
	});
};

export const resolveVariantUpdateSource = ({
	currentCustomize,
	incomingCustomize,
	hasPreviewDiff,
}: {
	currentCustomize?: DiffedCustomizePlanV1 | null;
	incomingCustomize?: DiffedCustomizePlanV1 | null;
	hasPreviewDiff: boolean;
}): VariantUpdateSource | null => {
	if (
		incomingCustomize != null &&
		variantCustomizeChanged({ currentCustomize, incomingCustomize })
	) {
		return "direct";
	}
	if (hasPreviewDiff) return "propagated";
	return null;
};
