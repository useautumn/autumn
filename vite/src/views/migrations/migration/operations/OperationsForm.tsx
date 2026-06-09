import type {
	AddPlanOp,
	CustomerOperation,
	Operations,
	UpdatePlanOp,
} from "@autumn/shared";
import { useState } from "react";
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
import { ActionCard } from "../shared/ActionCard";
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
	const [autoOpenPicker, setAutoOpenPicker] = useState(false);
	const operations = value.customer ?? [];
	const addPlanOps = operations.filter(
		(op): op is AddPlanOp => op.type === "add_plan",
	);
	const hasAddPlans = addPlanOps.length > 0;
	const isEmpty = operations.length === 0;

	const setOperations = (next: CustomerOperation[]) =>
		onChange({ ...value, customer: next });

	const updateAt = (index: number, updated: CustomerOperation) => {
		const next = [...operations];
		next[index] = updated;
		setOperations(next);
	};

	const removeAt = (index: number) =>
		setOperations(operations.filter((_, i) => i !== index));

	const handleAddPlansUpdate = (newAddPlanOps: AddPlanOp[]) => {
		const nonAdd = operations.filter((op) => op.type !== "add_plan");
		setOperations([...nonAdd, ...newAddPlanOps]);
	};

	const removeAllAddPlans = () =>
		setOperations(operations.filter((op) => op.type !== "add_plan"));

	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-2 border-b pb-3 mb-3">
				<span className="text-sm font-medium text-foreground">Billing Scope</span>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="flex items-center gap-2 h-8 px-3 rounded-xl text-sm cursor-pointer input-base text-foreground whitespace-nowrap overflow-hidden"
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
							<CaretDownIcon size={12} className="text-tertiary-foreground shrink-0" />
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
							{noBillingChanges && <CheckIcon size={14} className="text-tertiary-foreground" />}
						</DropdownMenuItem>
						<DropdownMenuItem
							closeOnClick
							onClick={() => onNoBillingChangesChange(false)}
						>
							<StripeMark size={14} />
							<span className="flex-1">
								Billing changes apply to Autumn and Stripe
							</span>
							{!noBillingChanges && <CheckIcon size={14} className="text-tertiary-foreground" />}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{isEmpty ? (
				<div className="flex flex-col gap-2">
					<span className="text-sm font-medium text-foreground">Add Operation</span>
					<div className="flex gap-3">
						<ActionCard
							icon={
								<PencilSimpleIcon
									size={20}
									weight="duotone"
									className="text-tertiary-foreground shrink-0"
								/>
							}
							heading="Update Plan"
							subheading="Modify existing customer plans"
							onClick={() => {
								setOperations([DEFAULT_UPDATE_PLAN]);
								setAutoOpenPicker(true);
							}}
							className="flex-1"
						/>
						<ActionCard
							icon={
								<PackageIcon
									size={20}
									weight="duotone"
									className="text-tertiary-foreground shrink-0"
								/>
							}
							heading="Add Plan"
							subheading="Assign a new plan to customers"
							onClick={() => {
								setOperations([{ type: "add_plan", plan_id: "" }]);
								setAutoOpenPicker(true);
							}}
							className="flex-1"
						/>
					</div>
				</div>
			) : (
				<>
					{operations.map((operation, index) => {
						if (operation.type === "add_plan") return null;
						return (
							<div key={`op-${index}`} className="flex flex-col">
								{index > 0 && <div className="border-t my-3" />}
								<UpdatePlanOpForm
									value={operation as UpdatePlanOp}
									onChange={(updated) => updateAt(index, updated)}
									onRemove={() => removeAt(index)}
									defaultOpenPicker={index === 0 && autoOpenPicker}
								/>
							</div>
						);
					})}

					{hasAddPlans && (
						<>
							{operations.some((op) => op.type === "update_plan") && (
								<div className="border-t my-3" />
							)}
							<AddPlansSection
								operations={addPlanOps}
								onUpdate={handleAddPlansUpdate}
								onRemoveAll={removeAllAddPlans}
								defaultOpenPicker={autoOpenPicker}
							/>
						</>
					)}

					<div className="border-t mt-3 pt-3">
						<DropdownMenu>
							<DropdownMenuTrigger className={DASHED_BUTTON_CLASS}>
								<PlusIcon size={10} />
								Update or add a different plan
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="start"
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
				</>
			)}
		</div>
	);
}
