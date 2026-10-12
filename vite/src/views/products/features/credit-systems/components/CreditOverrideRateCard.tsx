import type { CreditSchemaItem, Feature } from "@autumn/shared";
import { IconButton } from "@autumn/ui";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
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

	const restoreFeature = (featureId: string) => {
		const catalogItem = creditSystem?.config?.schema?.find(
			(item: CreditSchemaItem) => item.metered_feature_id === featureId,
		);
		if (catalogItem) onChange([...schema, catalogItem]);
	};

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

				{diff.excludedFeatureIds.length > 0 && (
					<div className="flex flex-col gap-1">
						<span className="text-tertiary-foreground text-xs">
							Not covered on this plan
						</span>
						{diff.excludedFeatureIds.map((featureId) => (
							<div
								key={featureId}
								className="flex items-center justify-between text-sm text-t3"
							>
								<span className="line-through">
									{featureDisplayName({
										features,
										featureId,
										plural: true,
										capitalize: true,
									})}
								</span>
								<IconButton
									variant="skeleton"
									iconOrientation="left"
									icon={<ArrowCounterClockwiseIcon size={12} />}
									onClick={() => restoreFeature(featureId)}
									className="!text-subtle hover:!text-foreground text-xs"
								>
									Restore
								</IconButton>
							</div>
						))}
					</div>
				)}
			</div>
		</CreditSchemaListProvider>
	);
}
