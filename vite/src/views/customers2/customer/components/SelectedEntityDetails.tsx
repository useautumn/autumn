import type { Entity, Feature, FullCustomer } from "@autumn/shared";
import { FeatureUsageType, getFeatureName } from "@autumn/shared";
import { TrashIcon, XIcon } from "@phosphor-icons/react";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useCusQuery } from "../../../customers/customer/hooks/useCusQuery";
import { DeleteEntity } from "./DeleteEntity";

const mutedDivClassName =
	"py-0.5 px-1.5 bg-muted rounded-lg text-t3 text-sm flex items-center gap-1 h-6 max-w-48 truncate ";

const placeholderText = "NULL";

export const SelectedEntityDetails = () => {
	const { customer } = useCusQuery();
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const { features } = useFeaturesQuery();

	const { entityId, setEntityId } = useEntity();

	const entities = (customer as FullCustomer)?.entities || [];

	const fullEntity = entities.find(
		(e: Entity) => e.id === entityId || e.internal_id === entityId,
	);

	const handleValueChange = (value: string) => {
		setEntityId(value);
	};

	const handleClearSelection = () => {
		setEntityId(null);
	};

	// Check if we should show the selector at all
	const hasContinuousUseFeatures = features?.some(
		(feature: Feature) =>
			feature.config?.usage_type === FeatureUsageType.Continuous,
	);

	if (!hasContinuousUseFeatures || !entities || entities.length === 0)
		return null;

	// Get the entity type display name
	const getEntityTypeText = () => {
		if (entities.length === 0) return "entities";

		// Check if all entities have the same feature_id
		const firstFeatureId = entities[0].feature_id;
		const allSameType = entities.every(
			(e: Entity) => e.feature_id === firstFeatureId,
		);

		if (allSameType && firstFeatureId && features) {
			const feature = features.find((f: Feature) => f.id === firstFeatureId);
			if (feature) {
				return getFeatureName({
					feature,
					units: entities.length,
				});
			}
		}

		return entities.length === 1 ? "entity" : "entities";
	};

	const getEntityValue = (entity: Entity) => entity.id || entity.internal_id;
	const getEntityLabel = (entity: Entity) =>
		entity.name || entity.id || entity.internal_id;

	return (
		<>
			<div className="flex gap-2 items-center justify-between w-full bg-card mt-1 border p-2 rounded-lg overflow-hidden flex-wrap">
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<SearchableSelect
						value={entityId}
						onValueChange={handleValueChange}
						options={entities}
						getOptionValue={getEntityValue}
						getOptionLabel={getEntityLabel}
						placeholder="Select entity"
						searchable
						searchPlaceholder="Search entities..."
						emptyText="No entities found"
						triggerClassName="w-full sm:w-72"
						renderValue={(entity) =>
							entity ? (
								<span className="text-t2 truncate">
									{entity.name || entity.id || entity.internal_id}
								</span>
							) : (
								<span className="text-t3">Select entity</span>
							)
						}
						renderOption={(entity, isSelected) => {
							const entityValue = getEntityValue(entity);
							return (
								<>
									<div className="flex gap-2 items-center min-w-0 flex-1">
										{entity.name && (
											<span className="text-sm shrink-0">{entity.name}</span>
										)}
										<span className="truncate text-t3 font-mono text-xs min-w-0">
											{entityValue}
										</span>
									</div>
									{isSelected && <CheckIcon className="size-4 shrink-0" />}
								</>
							);
						}}
					/>
					{entityId && (
						<Button
							size="icon"
							variant="skeleton"
							onClick={handleClearSelection}
							disabled={!entityId}
							className="text-t3 hover:text-t1 h-5 w-5 disabled:opacity-50 -mx-1"
						>
							<XIcon size={12} />
						</Button>
					)}
				</div>
				{entityId ? (
					<div className="flex gap-2 items-center min-w-0 shrink">
						<CopyButton
							text={entityId || placeholderText}
							size="mini"
							innerClassName=" max-w-48 truncate"
						/>
						{fullEntity?.feature_id && (
							<div className={mutedDivClassName}>
								<span className="font-mono text-tiny-id">
									{fullEntity.feature_id}
								</span>
							</div>
						)}
						<Button
							size="icon"
							variant="secondary"
							onClick={() => setDeleteDialogOpen(true)}
							disabled={!entityId}
						>
							<TrashIcon className="text-t3" />
						</Button>
					</div>
				) : (
					<div className="text-t3 text-sm pr-2">
						{entities.length} {getEntityTypeText()} active
					</div>
				)}
			</div>

			<DeleteEntity
				open={deleteDialogOpen}
				setOpen={setDeleteDialogOpen}
				entity={fullEntity}
			/>
		</>
	);
};
