import type {
	AddPlanOp,
	CustomerOperation,
	Operations,
	UpdatePlanOp,
} from "@autumn/shared";
import { PackageIcon, PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { cn } from "@/lib/utils";
import { DASHED_BUTTON_CLASS } from "../shared/AddButton";
import { AddPlansSection } from "./AddPlanOpForm";
import { UpdatePlanOpForm } from "./UpdatePlanOpForm";

const DEFAULT_UPDATE_PLAN: CustomerOperation = {
	type: "update_plan",
	plan_filter: {},
};

export function OperationsForm({
	value,
	onChange,
}: {
	value: Operations;
	onChange: (value: Operations) => void;
}) {
	const operations = value.customer ?? [];
	const updatePlanOps = operations.filter((op) => op.type === "update_plan");
	const addPlanOps = operations.filter((op) => op.type === "add_plan");
	const hasAddPlans = addPlanOps.length > 0;

	const setOperations = (next: CustomerOperation[]) =>
		onChange({ ...value, customer: next });

	const updateUpdatePlanAt = (index: number, updated: CustomerOperation) => {
		const next = [...updatePlanOps];
		next[index] = updated;
		setOperations([...next, ...addPlanOps]);
	};

	const removeUpdatePlanAt = (index: number) =>
		setOperations([
			...updatePlanOps.filter((_, i) => i !== index),
			...addPlanOps,
		]);

	const handleAddPlansUpdate = (newAddPlanOps: AddPlanOp[]) =>
		setOperations([...updatePlanOps, ...newAddPlanOps]);

	const removeAllAddPlans = () => setOperations([...updatePlanOps]);

	return (
		<div className="flex flex-col">
			{updatePlanOps.map((operation, index) => (
				<div key={`update-${index}`} className="flex flex-col">
					{index > 0 && <div className="border-t my-3" />}
					<UpdatePlanOpForm
						value={operation as UpdatePlanOp}
						onChange={(updated) => updateUpdatePlanAt(index, updated)}
						onRemove={() => removeUpdatePlanAt(index)}
					/>
				</div>
			))}

			{hasAddPlans && (
				<>
					{updatePlanOps.length > 0 && <div className="border-t my-3" />}
					<AddPlansSection
						operations={addPlanOps}
						onUpdate={handleAddPlansUpdate}
						onRemoveAll={removeAllAddPlans}
					/>
				</>
			)}

			<div className={cn(operations.length > 0 && "border-t mt-3 pt-3")}>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button type="button" className={DASHED_BUTTON_CLASS}>
							<PlusIcon size={10} />
							Add Operation
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						sideOffset={4}
						className="w-(--anchor-width)"
					>
						<DropdownMenuItem
							closeOnClick
							onClick={() =>
								setOperations([...operations, DEFAULT_UPDATE_PLAN])
							}
						>
							<PencilSimpleIcon size={14} weight="duotone" />
							Update Plan
						</DropdownMenuItem>
						{!hasAddPlans && (
							<DropdownMenuItem
								closeOnClick
								onClick={() =>
									setOperations([
										...operations,
										{ type: "add_plan", plan_id: "" },
									])
								}
							>
								<PackageIcon size={14} weight="duotone" />
								Add Plan
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
