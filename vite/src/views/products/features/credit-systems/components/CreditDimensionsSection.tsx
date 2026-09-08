import { getFeatureName } from "@autumn/shared";
import { useCreditSchemaListContext } from "../hooks/CreditSchemaListContext";
import { CreditDimensionPriceList } from "./CreditDimensionPriceList";

/** A price list per rate-card row; rows are named by feature only when there are several. */
export function CreditDimensionsSection() {
	const { schema, schemaKeys, allSchemaCandidateFeatures, setSchemaItem } =
		useCreditSchemaListContext();
	const labelRows = schema.length > 1;

	return (
		<div className="flex flex-col gap-4">
			{schema.map((item, index) => (
				<div key={schemaKeys[index]} className="flex flex-col gap-2">
					{labelRows && (
						<span className="text-sm">
							{getFeatureName({
								feature: allSchemaCandidateFeatures.find(
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
						onChange={(next) => setSchemaItem({ index, item: next })}
					/>
				</div>
			))}
		</div>
	);
}
