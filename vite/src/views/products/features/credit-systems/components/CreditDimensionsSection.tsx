import type { CreditSchemaItem, Feature } from "@autumn/shared";
import { getFeatureName } from "@autumn/shared";
import { FormLabel } from "@autumn/ui";
import { CreditDimensionPriceList } from "./CreditDimensionPriceList";

interface CreditDimensionsSectionProps {
	schema: CreditSchemaItem[];
	allFeatures: Feature[];
	onItemChange: (params: { index: number; item: CreditSchemaItem }) => void;
}

/** A price list per rate-card row; rows are named by feature only when there are several. */
export function CreditDimensionsSection({
	schema,
	allFeatures,
	onItemChange,
}: CreditDimensionsSectionProps) {
	const labelRows = schema.length > 1;

	return (
		<div className="flex flex-col gap-4">
			<FormLabel>Dimensions</FormLabel>
			{schema.map((item, index) => (
				<div key={index} className="flex flex-col gap-2">
					{labelRows && (
						<span className="text-sm">
							{getFeatureName({
								feature: allFeatures.find(
									(feature) => feature.id === item.metered_feature_id,
								),
								capitalize: true,
							}) ||
								item.metered_feature_id ||
								"Select a feature"}
						</span>
					)}
					<CreditDimensionPriceList
						item={item}
						onChange={(next) => onItemChange({ index, item: next })}
					/>
				</div>
			))}
		</div>
	);
}
