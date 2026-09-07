import type { CreditSchemaItem, Feature } from "@autumn/shared";
import { getFeatureName } from "@autumn/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { CreditSchemaListProvider } from "../hooks/CreditSchemaListContext";
import { useCreditDimensionsToggle } from "../hooks/useCreditDimensionsToggle";
import { useCreditOverrideDiff } from "../hooks/useCreditOverrideDiff";
import { CreditDimensionsSection } from "./CreditDimensionsSection";
import { CreditDimensionsSwitch } from "./CreditDimensionsSwitch";
import { CreditRateCardList } from "./CreditRateCardList";

const statusLabel = {
	inherited: null,
	changed: "Changed",
	added: "Added",
} as const;

/** The rate card as a diff against the credit system it overrides. */
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
	const { isAdmin } = useAdmin();
	const dimensions = useCreditDimensionsToggle({ schema, setSchema: onChange });
	const diff = useCreditOverrideDiff({ schema, creditSystem });

	const missingFeatureNames = diff.missingFeatureIds
		.map(
			(featureId) =>
				getFeatureName({
					feature: features.find(
						(feature: Feature) => feature.id === featureId,
					),
					plural: true,
				}) || featureId,
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
						{diff.changedCount} of {diff.catalogCount || schema.length} rates
						differ from the credit system
					</span>
				)}

				<CreditRateCardList
					renderRowLabel={(index) => {
						const label = statusLabel[diff.statusByIndex[index]];
						if (!label) return null;
						return (
							<span className="text-tertiary-foreground text-xs">{label}</span>
						);
					}}
				/>

				{/* The override is a snapshot, so a feature added to the credit system
				    afterwards will not reach customers on this plan. */}
				{missingFeatureNames && (
					<span className="text-tertiary-foreground text-xs">
						Not in this override: {missingFeatureNames}
					</span>
				)}

				{isAdmin && (
					<CreditDimensionsSwitch
						checked={dimensions.enabled}
						onCheckedChange={dimensions.setEnabled}
					/>
				)}
				{isAdmin && dimensions.enabled && <CreditDimensionsSection />}
			</div>
		</CreditSchemaListProvider>
	);
}
