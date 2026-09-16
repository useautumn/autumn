import type { CreditSchemaItem, Feature } from "@autumn/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { CreditSchemaListProvider } from "../hooks/CreditSchemaListContext";
import { diffCreditOverride } from "../utils/diffCreditOverride";
import { featureDisplayName } from "../utils/featureDisplayName";
import { CreditRateCardList } from "./CreditRateCardList";
import { RowStatusBadge } from "./RowStatusBadge";

export function CreditOverrideRateCard({
	schema,
	creditSystem,
	onChange,
	onRemoveLast,
}: {
	schema: CreditSchemaItem[];
	creditSystem?: Feature;
	onChange: (schema: CreditSchemaItem[]) => void;
	onRemoveLast: () => void;
}) {
	const { features } = useFeaturesQuery();
	const diff = diffCreditOverride({ schema, creditSystem });

	const missingFeatureNames = diff.missingFeatureIds
		.map((featureId) =>
			featureDisplayName({ features, featureId, plural: true }),
		)
		.join(", ");

	return (
		<CreditSchemaListProvider
			schema={schema}
			onChange={onChange}
			onRemoveLast={onRemoveLast}
		>
			<div className="flex flex-col gap-3">
				{diff.changedCount > 0 && (
					<span className="text-tertiary-foreground text-xs">
						{diff.changedCount} of {diff.totalCount} rates differ from the
						credit system
					</span>
				)}

				<CreditRateCardList
					renderRowLabel={(index) => (
						<RowStatusBadge status={diff.statusByIndex[index]} />
					)}
				/>

				{missingFeatureNames && (
					<span className="text-tertiary-foreground text-xs">
						Not in this override: {missingFeatureNames}
					</span>
				)}
			</div>
		</CreditSchemaListProvider>
	);
}
