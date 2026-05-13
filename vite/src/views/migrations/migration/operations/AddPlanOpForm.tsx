import type { AddPlanOp, CustomerOperation } from "@autumn/shared";
import { useMemo } from "react";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { buildPlanSuggestions } from "../shared/planSuggestions";
import { RemoveButton } from "../shared/RemoveButton";
import { ValuePicker } from "../shared/ValuePicker";

export function AddPlansSection({
	operations,
	onUpdate,
	onRemoveAll,
}: {
	operations: CustomerOperation[];
	onUpdate: (addPlanOps: AddPlanOp[]) => void;
	onRemoveAll: () => void;
}) {
	const { products } = useProductsQuery();
	const planSuggestions = useMemo(
		() => buildPlanSuggestions(products),
		[products],
	);

	const selectedPlanIds = operations
		.filter((op): op is AddPlanOp => op.type === "add_plan")
		.map((op) => op.plan_id)
		.filter(Boolean);

	const handleToggle = (planId: string) => {
		const isSelected = selectedPlanIds.includes(planId);
		const nextIds = isSelected
			? selectedPlanIds.filter((id) => id !== planId)
			: [...selectedPlanIds, planId];
		onUpdate(nextIds.map((id) => ({ type: "add_plan" as const, plan_id: id })));
	};

	const handleRemove = (planId: string) => {
		const nextIds = selectedPlanIds.filter((id) => id !== planId);
		onUpdate(nextIds.map((id) => ({ type: "add_plan" as const, plan_id: id })));
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between group/row">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium text-t1">
						{selectedPlanIds.length > 1 ? "Add Plans" : "Add Plan"}
					</span>
					{selectedPlanIds.length > 0 && (
						<span className="text-xs text-t3">
							{selectedPlanIds.length}{" "}
							{selectedPlanIds.length === 1 ? "plan" : "plans"}
						</span>
					)}
				</div>
				<RemoveButton onClick={onRemoveAll} />
			</div>

			<ValuePicker
				suggestions={planSuggestions}
				selectedValues={selectedPlanIds}
				onToggle={handleToggle}
				onRemove={handleRemove}
				placeholder="Select plans..."
				className="flex-1"
			/>
		</div>
	);
}
