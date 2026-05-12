import type { CustomerOperation, UpdatePlanOp } from "@autumn/shared";
import { RemoveButton } from "../shared/RemoveButton";
import { UpdatePlanOpForm } from "./UpdatePlanOpForm";

export function CustomerOperationCard({
	value,
	onChange,
	onRemove,
}: {
	value: CustomerOperation;
	onChange: (value: CustomerOperation) => void;
	onRemove: () => void;
}) {
	return (
		<div className="flex flex-col">
			{value.type === "update_plan" && (
				<UpdatePlanOpForm
					value={value as UpdatePlanOp}
					onChange={(updated) => onChange(updated as CustomerOperation)}
					onRemove={onRemove}
				/>
			)}
		</div>
	);
}
