import type { Entity, Feature, FullCustomer } from "@autumn/shared";
import { FeatureUsageType, getFeatureName } from "@autumn/shared";
import { Trash, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useCustomerContext } from "../CustomerContext";
import { DeleteEntity } from "./DeleteEntity";

const mutedDivClassName =
	"py-0.5 px-1.5 bg-muted rounded-lg text-t3 text-sm flex items-center gap-1 h-6 max-w-48 truncate ";

const placeholderText = "NULL";

export const SelectedEntityDetails = () => {
	const { customer, entityId, setEntityId } = useCustomerContext();
	const [selectValue, setSelectValue] = useState<string | undefined>(
		entityId || undefined,
	);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const navigate = useNavigate();
	const location = useLocation();
	const { features } = useFeaturesQuery();

	const entities = (customer as FullCustomer).entities || [];

	// Sync selectValue with entityId
	useEffect(() => {
		setSelectValue(entityId || undefined);
	}, [entityId]);

	const selectedEntity = entityId
		? entities.find(
				(e: Entity) => e.id === entityId || e.internal_id === entityId,
			)
		: null;

	const entity = entities.find(
		(e: Entity) => e.id === entityId || e.internal_id === entityId,
	);

	const handleValueChange = (value: string) => {
		const params = new URLSearchParams(location.search);
		params.set("entity_id", value);
		navigate(`${location.pathname}?${params.toString()}`);
		setEntityId(value);
		setSelectValue(value);
	};

	const handleClearSelection = () => {
		const params = new URLSearchParams(location.search);
		params.delete("entity_id");
		navigate(`${location.pathname}?${params.toString()}`);
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

	// Render the entity selector
	const renderEntitySelector = () => {
		return (
			<div className="w-48">
				<Select
					key={entityId || "no-selection"}
					value={selectValue}
					onValueChange={handleValueChange}
				>
					<SelectTrigger size="sm" className="gap-1.5 overflow-hidden w-full">
						<SelectValue placeholder="Select entity">
							<div className="max-w-36">
								{entityId ? (
									<span className="text-t2 font-sans truncate block overflow-hidden">
										{entity?.name ||
											entity?.id ||
											entity?.internal_id ||
											entityId}
									</span>
								) : (
									<span className="text-t6 font-sans truncate">
										Select entity
									</span>
								)}
							</div>
						</SelectValue>
					</SelectTrigger>
					<SelectContent className="max-w-96">
						{entities.map((e: Entity) => (
							<SelectItem
								key={e.id || e.internal_id}
								value={e.id || e.internal_id}
								className="truncate overflow-hidden flex gap-4"
							>
								{e.name ? (
									<span className=" text-sm ml-1 truncate max-w-48">
										{e.name}
									</span>
								) : null}
								<span className="truncate overflow-hidden max-w-24 text-t3 font-mono">
									{e.id || e.internal_id}
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		);
	};

	return (
		<>
			<div className="flex gap-2 items-center justify-between w-full bg-secondary p-2 rounded-lg border border-border-table overflow-hidden">
				{selectedEntity ? (
					<div className="flex gap-2 items-center min-w-0 shrink">
						{selectedEntity.name && (
							<div className={mutedDivClassName}>
								<span className="truncate">{selectedEntity.name}</span>
							</div>
						)}
						<CopyButton
							text={
								selectedEntity.id ||
								selectedEntity.internal_id ||
								placeholderText
							}
							size="sm"
							innerClassName="!text-sm !font-sans max-w-48 truncate"
						/>
						{selectedEntity.feature_id && (
							<div className={mutedDivClassName}>
								<span className="truncate">{selectedEntity.feature_id}</span>
							</div>
						)}
					</div>
				) : (
					<div className="text-t3 text-sm">
						{entities.length} {getEntityTypeText()} active
					</div>
				)}
				<div className="flex items-center gap-2 shrink-0">
					{renderEntitySelector()}
					<Button
						size="icon"
						variant="secondary"
						onClick={() => setDeleteDialogOpen(true)}
						disabled={!entityId}
						className="text-t3 hover:text-red-500 dark:hover:text-red-400 h-7 w-7 disabled:opacity-50"
					>
						<Trash size={16} />
					</Button>
					<Button
						size="icon"
						variant="skeleton"
						onClick={handleClearSelection}
						disabled={!entityId}
						className="text-t3 hover:text-t1 h-7 w-7 disabled:opacity-50 -mx-1"
					>
						<X size={16} />
					</Button>
				</div>
			</div>
			<DeleteEntity
				open={deleteDialogOpen}
				setOpen={setDeleteDialogOpen}
				entity={selectedEntity}
			/>
		</>
	);
};
