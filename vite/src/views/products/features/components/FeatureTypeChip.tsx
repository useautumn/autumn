import type { FeatureUsageType } from "@autumn/shared";
import { StatusChip } from "@autumn/ui";
import { getFeatureIconConfig } from "../utils/getFeatureIcon";

export function FeatureTypeChip({
	featureType,
	usageType,
}: {
	featureType: string;
	usageType?: FeatureUsageType | null;
}) {
	const { tone, glyph, label } = getFeatureIconConfig(featureType, usageType);

	return (
		<StatusChip tone={tone} glyph={glyph}>
			{label}
		</StatusChip>
	);
}
