import type {
	AddPlanOp,
	CustomerOperation,
	Operations,
	UpdatePlanOp,
} from "@autumn/shared";
import {
	CaretDownIcon,
	CheckIcon,
	PackageIcon,
	PencilSimpleIcon,
	PlusIcon,
} from "@phosphor-icons/react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { cn } from "@/lib/utils";
import { DASHED_BUTTON_CLASS } from "../shared/AddButton";
import { AutumnMark, StripeMark } from "../shared/BillingScopeMarks";
import { AddPlansSection } from "./AddPlanOpForm";
import { UpdatePlanOpForm } from "./UpdatePlanOpForm";

const DEFAULT_UPDATE_PLAN: CustomerOperation = {
	type: "update_plan",
	plan_filter: {},
};

export function OperationsForm({
	value,
	onChange,
	noBillingChanges,
	onNoBillingChangesChange,
}: {
	value: Operations;
	onChange: (value: Operations) => void;
	noBillingChanges: boolean;
	onNoBillingChangesChange: (value: boolean) => void;
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

			<div className="border-t mt-3 pt-3 flex flex-col gap-2">
				<span className="text-sm font-medium text-t1">Billing Scope</span>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="flex items-center gap-2 h-8 px-3 rounded-xl text-sm cursor-pointer input-base text-t1 whitespace-nowrap overflow-hidden"
						>
							{noBillingChanges ? (
								<AutumnMark size={14} />
							) : (
								<StripeMark size={14} />
							)}
							<span className="flex-1 text-left truncate">
								{noBillingChanges
									? "Billing changes apply to Autumn only"
									: "Billing changes apply to Autumn and Stripe"}
							</span>
							<CaretDownIcon size={12} className="text-t3 shrink-0" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-(--anchor-width)">
						<DropdownMenuItem
							closeOnClick
							onClick={() => onNoBillingChangesChange(true)}
						>
							<AutumnMark size={14} />
							<span className="flex-1">
								Billing changes apply to Autumn only
							</span>
							{noBillingChanges && <CheckIcon size={14} className="text-t3" />}
						</DropdownMenuItem>
						<DropdownMenuItem
							closeOnClick
							onClick={() => onNoBillingChangesChange(false)}
						>
							<StripeMark size={14} />
							<span className="flex-1">
								Billing changes apply to Autumn and Stripe
							</span>
							{!noBillingChanges && <CheckIcon size={14} className="text-t3" />}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
