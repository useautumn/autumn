import type { CarryOverUsages } from "@autumn/shared";

export type CarryOverFormValue = { enabled: boolean; featureIds: string[] };

export const carryOverParam = ({
	enabled,
	featureIds,
}: CarryOverFormValue): NonNullable<CarryOverUsages> | undefined => {
	if (!enabled) return undefined;
	return featureIds.length > 0
		? { enabled: true, feature_ids: featureIds }
		: { enabled: true };
};
