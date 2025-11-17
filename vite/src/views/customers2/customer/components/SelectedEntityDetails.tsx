import type { Entity, Feature, FullCustomer } from "@autumn/shared";
import { FeatureUsageType, getFeatureName } from "@autumn/shared";
import { TrashIcon, X } from "@phosphor-icons/react";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { useCustomerContext } from "../CustomerContext";
import { DeleteEntity } from "./DeleteEntity";

const mutedDivClassName =
	"py-0.5 px-1.5 bg-muted rounded-lg text-t3 text-sm flex items-center gap-1 h-6 max-w-48 truncate ";

const placeholderText = "NULL";

export const SelectedEntityDetails = () => {
	const { customer, entityId, setEntityId } = useCustomerContext();
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const navigate = useNavigate();
	const location = useLocation();
	const { features } = useFeaturesQuery();

	const entities = (customer as FullCustomer).entities || [];

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
		const displayText = entityId
			? entity?.name || entity?.id || entity?.internal_id || entityId
			: "Select entity";

		return (
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="secondary"
						role="combobox"
						size="mini"
						className="justify-between font-normal px-2! gap-3 w-48"
					>
						<span className="truncate text-sm">
							{entityId ? (
								<span className="text-t2">{displayText}</span>
							) : (
								<span className="text-t6">{displayText}</span>
							)}
						</span>
						<ChevronDown className="h-4 w-4 shrink-0 text-t3" />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					className="w-[320px] p-1 max-h-[300px] overflow-y-auto"
					align="end"
				>
					{entities.map((e: Entity) => {
						const isSelected = entityId === e.id || entityId === e.internal_id;
						const entityValue = e.id || e.internal_id;
						return (
							<div
								key={entityValue}
								className={cn(
									"relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground gap-2",
									isSelected && "bg-accent/50",
								)}
								onClick={() => handleValueChange(entityValue)}
							>
								<Check
									className={cn(
										"h-4 w-4 shrink-0",
										isSelected ? "opacity-100" : "opacity-0",
									)}
								/>
								<div className="flex gap-2 items-center min-w-0 flex-1">
									{e.name && (
										<span className="text-sm truncate max-w-[120px]">
											{e.name}
										</span>
									)}
									<span className="truncate overflow-hidden text-t3 font-mono text-xs">
										{entityValue}
									</span>
								</div>
							</div>
						);
					})}
				</PopoverContent>
			</Popover>
		);
	};

	return (
		<>
			<div className="flex gap-2 items-center justify-between w-full bg-card mt-1 border p-2 rounded-lg overflow-hidden">
				<div className="flex items-center gap-2 shrink-0">
					{renderEntitySelector()}
					{entityId && (
						<Button
							size="icon"
							variant="skeleton"
							onClick={handleClearSelection}
							disabled={!entityId}
							className="text-t3 hover:text-t1 h-5 w-5 disabled:opacity-50 -mx-1"
						>
							<X size={12} />
						</Button>
					)}
				</div>
				{selectedEntity ? (
					<div className="flex gap-2 items-center min-w-0 shrink">
						{/* {selectedEntity.name && (
							<div className={mutedDivClassName}>
								<span className="truncate">{selectedEntity.name}</span>
							</div>
						)} */}
						<CopyButton
							text={
								selectedEntity.id ||
								selectedEntity.internal_id ||
								placeholderText
							}
							size="mini"
							innerClassName=" max-w-48 truncate"
						/>
						{selectedEntity.feature_id && (
							<div className={mutedDivClassName}>
								<span className="font-mono text-tiny-id">
									{selectedEntity.feature_id}
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
					<div className="text-t3 text-sm">
						{entities.length} {getEntityTypeText()} active
					</div>
				)}
			</div>

			<DeleteEntity
				open={deleteDialogOpen}
				setOpen={setDeleteDialogOpen}
				entity={selectedEntity}
			/>
		</>
	);
};
