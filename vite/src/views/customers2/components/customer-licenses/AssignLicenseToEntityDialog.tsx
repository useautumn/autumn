import type { ApiCustomerLicenseV0, Entity, Feature } from "@autumn/shared";
import { FeatureUsageType } from "@autumn/shared";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	GroupedTabButton,
	LabelInput,
	SearchableSelect,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import type { useLicenseBalancesQuery } from "@/hooks/queries/useLicenseBalancesQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { useEntitiesQuery } from "@/views/customers2/customer/hooks/useEntitiesQuery";
import { runWithErrorToast } from "@/views/products/plan/components/plan-licenses/runWithErrorToast";

type AssignMutation = ReturnType<typeof useLicenseBalancesQuery>["assign"];

const PLACEHOLDER = "PENDING";
const EMPTY_ENTITY = { id: "", name: "", feature_id: "" };

/**
 * Customer-level license assignment: pick an existing entity or create one
 * inline, then attach a seat via licenses.attach (its upsert path creates
 * unknown entities). Rendered from the customer's license pools section.
 */
export function AssignLicenseToEntityDialog({
	pool,
	customerId,
	hasEntities,
	assign,
	onClose,
}: {
	pool: ApiCustomerLicenseV0 | null;
	customerId: string;
	/** When the customer has no entities, skip the toggle and force create. */
	hasEntities: boolean;
	assign: AssignMutation;
	onClose: () => void;
}) {
	const open = pool !== null;
	const [mode, setMode] = useState<"existing" | "new">("existing");
	const [entityId, setEntityId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [newEntity, setNewEntity] = useState(EMPTY_ENTITY);

	const activeMode = hasEntities ? mode : "new";

	useEffect(() => {
		if (!open) {
			setMode("existing");
			setEntityId(null);
			setSearch("");
			setNewEntity(EMPTY_ENTITY);
		}
	}, [open]);

	const debouncedSearch = useDebounce({ value: search, delayMs: 300 });
	const { entities, isLoading } = useEntitiesQuery({
		search: debouncedSearch || undefined,
		enabled: open && activeMode === "existing",
	});

	const { features } = useFeaturesQuery();
	const continuousFeatures = (features ?? []).filter(
		(feature: Feature) =>
			feature.config?.usage_type === FeatureUsageType.Continuous,
	);

	const canAssign =
		activeMode === "existing"
			? Boolean(entityId)
			: Boolean(newEntity.id && newEntity.feature_id);

	const handleAssign = async () => {
		if (!(pool && canAssign)) return;
		const entity =
			activeMode === "existing"
				? { entity_id: entityId as string }
				: {
						entity_id: newEntity.id,
						name: newEntity.name || null,
						feature_id: newEntity.feature_id,
					};
		const ok = await runWithErrorToast({
			action: () =>
				assign.mutateAsync({
					customer_id: customerId,
					plan_id: pool.license_plan_id,
					entities: [entity],
				}),
			fallbackMessage: "Failed to assign license",
		});
		if (ok) {
			toast.success("License assigned");
			onClose();
		}
	};

	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent className="w-[420px] bg-card">
				<DialogHeader>
					<DialogTitle>Assign {pool?.license_plan_name}</DialogTitle>
					<DialogDescription>
						{hasEntities
							? "Assign a seat to an existing entity, or create a new one."
							: "Create an entity to assign this seat to."}
					</DialogDescription>
				</DialogHeader>

				{hasEntities && (
					<GroupedTabButton
						className="w-full"
						onValueChange={(value) => setMode(value as "existing" | "new")}
						options={[
							{ value: "existing", label: "Existing entity" },
							{ value: "new", label: "New entity" },
						]}
						value={mode}
					/>
				)}

				{activeMode === "existing" ? (
					<SearchableSelect
						emptyText="No entities found"
						getOptionLabel={(entity: Entity) =>
							entity.name || entity.id || PLACEHOLDER
						}
						getOptionValue={(entity: Entity) => entity.id || entity.internal_id}
						isLoading={isLoading}
						onSearchChange={setSearch}
						onValueChange={setEntityId}
						options={entities}
						placeholder="Select entity"
						renderOption={(entity: Entity, isSelected: boolean) => (
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
						searchable
						searchPlaceholder="Search entities..."
						triggerClassName="w-full"
						value={entityId}
					/>
				) : (
					<div className="flex flex-col gap-4">
						<div className="flex gap-2">
							<LabelInput
								className="flex-1"
								label="ID"
								onChange={(e) =>
									setNewEntity({ ...newEntity, id: e.target.value })
								}
								placeholder="Enter ID"
								value={newEntity.id}
							/>
							<LabelInput
								className="flex-1"
								label="Name"
								onChange={(e) =>
									setNewEntity({ ...newEntity, name: e.target.value })
								}
								placeholder="Enter name"
								value={newEntity.name}
							/>
						</div>
						<div>
							<div className="text-form-label block mb-1">Feature ID</div>
							<Select
								items={Object.fromEntries(
									continuousFeatures.map((feature: Feature) => [
										feature.id,
										feature.name,
									]),
								)}
								onValueChange={(value) =>
									setNewEntity({ ...newEntity, feature_id: value })
								}
								value={newEntity.feature_id}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select feature" />
								</SelectTrigger>
								<SelectContent>
									{continuousFeatures.length > 0 ? (
										continuousFeatures.map((feature: Feature) => (
											<SelectItem key={feature.id} value={feature.id}>
												{feature.name}
											</SelectItem>
										))
									) : (
										<div className="px-2 py-1.5 text-sm text-muted-foreground">
											Create a non-consumable feature first (e.g. seats,
											projects)
										</div>
									)}
								</SelectContent>
							</Select>
						</div>
					</div>
				)}

				<DialogFooter>
					<Button onClick={onClose} variant="secondary">
						Cancel
					</Button>
					<Button
						disabled={!canAssign}
						isLoading={assign.isPending}
						onClick={handleAssign}
						variant="primary"
					>
						Assign
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
