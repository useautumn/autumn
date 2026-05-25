import { PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import { cn } from "@/lib/utils";
import { useEntitySelector } from "../hooks/useEntitySelector";
import { CreateEntity } from "./CreateEntity";
import { DeleteEntity } from "./DeleteEntity";

const PLACEHOLDER = "PENDING";

export const SelectedEntityDetails = () => {
	const [isDeleteOpen, setDeleteOpen] = useState(false);
	const [isCreateOpen, setCreateOpen] = useState(false);

	const {
		entities,
		selectedEntity,
		entityId,
		totalCount,
		entityTypeText,
		isLoading,
		isVisible,
		setEntityId,
		setSearch,
		refetch,
		getEntityValue,
		getEntityLabel,
	} = useEntitySelector();

	if (!isVisible) return null;

	return (
		<>
			<div className="flex gap-2 items-center justify-between w-full bg-card mt-1 border p-2 rounded-lg overflow-hidden flex-wrap">
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<SearchableSelect
						value={entityId}
						onValueChange={setEntityId}
						options={entities}
						getOptionValue={getEntityValue}
						getOptionLabel={getEntityLabel}
						placeholder="Select entity"
						searchable
						searchPlaceholder="Search entities..."
						emptyText="No entities found"
						triggerClassName="w-full sm:w-72"
						onSearchChange={setSearch}
						isLoading={isLoading}
						renderValue={(entity) => (
							<span
								className={cn(
									"truncate",
									entity ? "text-muted-foreground" : "text-tertiary-foreground",
								)}
							>
								{entity
									? (entity.name || entity.id || PLACEHOLDER)
									: "Select entity"}
							</span>
						)}
						renderOption={(entity, isSelected) => (
							<>
								<div className="flex gap-2 items-center min-w-0 flex-1">
									{entity.name && (
										<span className="text-sm shrink-0">{entity.name}</span>
									)}
									<span className="truncate text-tertiary-foreground font-mono text-xs min-w-0">
										{entity.id || PLACEHOLDER}
									</span>
								</div>
								{isSelected && <CheckIcon className="size-4 shrink-0" />}
							</>
						)}
						footer={
							<div className="border-t py-1.5 px-2">
								<Button
									variant="muted"
									className="w-full"
									onClick={() => setCreateOpen(true)}
								>
									<PlusIcon
										className="size-[14px] text-muted-foreground"
										weight="regular"
									/>
									Create new entity
								</Button>
							</div>
						}
					/>
					{entityId && (
						<Button
							size="icon"
							variant="skeleton"
							onClick={() => setEntityId(null)}
							className="text-tertiary-foreground hover:text-foreground h-5 w-5 -mx-1"
						>
							<XIcon size={12} />
						</Button>
					)}
				</div>

				{entityId ? (
					<div className="flex gap-2 items-center min-w-0 shrink">
						<CopyButton
							text={selectedEntity?.id || PLACEHOLDER}
							size="mini"
							className="text-tertiary-foreground"
							innerClassName="max-w-48 text-tiny-id truncate !font-normal"
						/>
						{selectedEntity?.feature_id && (
							<div className="py-0.5 px-1.5 bg-muted rounded-lg text-tertiary-foreground text-sm flex items-center gap-1 h-6 max-w-48 truncate">
								<span className="font-mono text-tiny-id">
									{selectedEntity.feature_id}
								</span>
							</div>
						)}
						<Button
							size="icon"
							variant="secondary"
							onClick={() => setDeleteOpen(true)}
						>
							<TrashIcon className="text-tertiary-foreground" />
						</Button>
					</div>
				) : (
					<div className="text-tertiary-foreground text-sm pr-2">
						{totalCount} {entityTypeText} active
					</div>
				)}
			</div>

			<DeleteEntity
				open={isDeleteOpen}
				setOpen={setDeleteOpen}
				entity={selectedEntity}
				onDeleted={refetch}
			/>
			<CreateEntity
				open={isCreateOpen}
				setOpen={setCreateOpen}
				onCreated={refetch}
			/>
		</>
	);
};
