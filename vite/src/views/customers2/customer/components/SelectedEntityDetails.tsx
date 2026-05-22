import type { Entity, Feature, FullCustomer } from "@autumn/shared";
import { FeatureUsageType, getFeatureName } from "@autumn/shared";
import { PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useViewAsStore } from "@/hooks/stores/useViewAsStore";
import {
	useEffectiveEntityId,
	useIsViewingAsPast,
} from "@/views/customers2/hooks/useEffectiveNow";
import { filterEntitiesVisibleAt } from "@/views/customers2/utils/effectiveCustomerProductStatus";
import { useCusQuery } from "../../../customers/customer/hooks/useCusQuery";
import { CreateEntity } from "./CreateEntity";
import { DeleteEntity } from "./DeleteEntity";

const mutedDivClassName =
	"py-0.5 px-1.5 bg-muted rounded-lg text-tertiary-foreground text-sm flex items-center gap-1 h-6 max-w-48 truncate ";

const placeholderText = "PENDING";

export const SelectedEntityDetails = () => {
	const { customer } = useCusQuery();
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [createEntityOpen, setCreateEntityOpen] = useState(false);
	const { features } = useFeaturesQuery();

	const { setEntityId } = useEntity();
	const isViewAs = useIsViewingAsPast();
	// In view-as mode, the effective entity comes from the pinned view-as scope
	// (not the URL). The switcher is read-only in this mode.
	const entityId = useEffectiveEntityId();
	const asOfMs = useViewAsStore((s) => s.asOfMs);

	const rawEntities = (customer as FullCustomer)?.entities || [];
	const entities =
		isViewAs && asOfMs != null
			? filterEntitiesVisibleAt({
					entities: rawEntities,
					nowMs: asOfMs,
					pinnedEntityId: entityId,
				})
			: rawEntities;

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
		entity.name || entity.id || placeholderText;

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
						disabled={isViewAs}
						searchPlaceholder="Search entities..."
						emptyText="No entities found"
						triggerClassName="w-full sm:w-72"
						renderValue={(entity) =>
							entity ? (
								<span className="text-muted-foreground truncate">
									{entity.name || entity.id || placeholderText}
								</span>
							) : (
								<span className="text-tertiary-foreground">Select entity</span>
							)
						}
						renderOption={(entity, isSelected) => {
							const entityLabel = entity.id || placeholderText;
							return (
								<>
									<div className="flex gap-2 items-center min-w-0 flex-1">
										{entity.name && (
											<span className="text-sm shrink-0">{entity.name}</span>
										)}
										<span className="truncate text-tertiary-foreground font-mono text-xs min-w-0">
											{entityLabel}
										</span>
									</div>
									{isSelected && <CheckIcon className="size-4 shrink-0" />}
								</>
							);
						}}
						footer={
							isViewAs ? undefined : (
								<div className="border-t py-1.5 px-2">
									<Button
										variant="muted"
										className="w-full"
										onClick={() => setCreateEntityOpen(true)}
									>
										<PlusIcon
											className="size-[14px] text-muted-foreground"
											weight="regular"
										/>
										Create new entity
									</Button>
								</div>
							)
						}
					/>
					{entityId && (
						<Button
							size="icon"
							variant="skeleton"
							onClick={handleClearSelection}
							disabled={!entityId || isViewAs}
							className="text-tertiary-foreground hover:text-foreground h-5 w-5 disabled:opacity-50 -mx-1"
						>
							<XIcon size={12} />
						</Button>
					)}
				</div>
				{entityId ? (
					<div className="flex gap-2 items-center min-w-0 shrink">
						<CopyButton
							text={fullEntity?.id || placeholderText}
							size="mini"
							className="text-tertiary-foreground"
							innerClassName="max-w-48 text-tiny-id truncate !font-normal"
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
							disabled={!entityId || isViewAs}
						>
							<TrashIcon className="text-tertiary-foreground" />
						</Button>
					</div>
				) : (
					<div className="text-tertiary-foreground text-sm pr-2">
						{entities.length} {getEntityTypeText()} active
					</div>
				)}
			</div>

			<DeleteEntity
				open={deleteDialogOpen}
				setOpen={setDeleteDialogOpen}
				entity={fullEntity}
			/>
			<CreateEntity open={createEntityOpen} setOpen={setCreateEntityOpen} />
		</>
	);
};
