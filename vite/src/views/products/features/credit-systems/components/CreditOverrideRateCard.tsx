import type { CreditSchemaItem, Feature } from "@autumn/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { CreditSchemaListProvider } from "../hooks/CreditSchemaListContext";
import { useCreditDimensionsToggle } from "../hooks/useCreditDimensionsToggle";
import {
	type CreditOverrideRowStatus,
	useCreditOverrideDiff,
} from "../hooks/useCreditOverrideDiff";
import { featureDisplayName } from "../utils/featureDisplayName";
import { CreditDimensionsSection } from "./CreditDimensionsSection";
import { CreditDimensionsSwitch } from "./CreditDimensionsSwitch";
import { CreditRateCardList } from "./CreditRateCardList";

const statusLabel: Record<CreditOverrideRowStatus, string | null> = {
	inherited: null,
	changed: "Changed",
	added: "Added",
};

const RowStatus = ({ status }: { status: CreditOverrideRowStatus }) => {
	const label = statusLabel[status];
	if (!label) return null;
	return <span className="text-tertiary-foreground text-xs">{label}</span>;
};

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
						{diff.changedCount} of {diff.catalogCount || schema.length} rates
						differ from the credit system
					</span>
				)}

				<CreditRateCardList
					renderRowLabel={(index) => (
						<RowStatus status={diff.statusByIndex[index]} />
					)}
				/>

				{missingFeatureNames && (
					<span className="text-tertiary-foreground text-xs">
						Not in this override: {missingFeatureNames}
					</span>
				)}

				{isAdmin && (
					<>
						<CreditDimensionsSwitch
							checked={dimensions.enabled}
							onCheckedChange={dimensions.setEnabled}
						/>
						{dimensions.enabled && <CreditDimensionsSection />}
					</>
				)}
			</div>
		</CreditSchemaListProvider>
	);
}
