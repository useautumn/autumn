import type { CustomerOperation, UpdatePlanOp } from "@autumn/shared";
import { RemoveButton } from "../shared/RemoveButton";
import { UpdatePlanOpForm } from "./UpdatePlanOpForm";

export function CustomerOperationCard({
	value,
	onChange,
	onRemove,
	index,
}: {
	value: CustomerOperation;
	onChange: (value: CustomerOperation) => void;
	onRemove: () => void;
	index: number;
}) {
	return (
		<div className="flex flex-col">
			<div className="flex items-center gap-2.5 group/row py-1">
				<span className="text-xs text-t4 w-12 shrink-0 select-none">
					{index === 0 ? "Do" : "Then"}
				</span>
				<span className="text-xs text-t1 font-medium">
					{value.type === "update_plan" ? "Update Plan" : value.type}
				</span>
				<RemoveButton onClick={onRemove} />
			</div>

			{value.type === "update_plan" && (
				<UpdatePlanOpForm
					value={value as UpdatePlanOp}
					onChange={(updated) => onChange(updated as CustomerOperation)}
				/>
			)}
		</div>
	);
}
