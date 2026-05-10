import type { CustomerOperation, UpdatePlanOp } from "@autumn/shared";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
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
				<span className="text-xs text-t3 w-12 shrink-0 select-none">
					{index === 0 ? "Do" : "Then"}
				</span>
				<Select value={value.type} onValueChange={() => {}}>
					<SelectTrigger className="h-7 text-xs min-w-32 px-3 shrink-0">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="update_plan">Update Plan</SelectItem>
					</SelectContent>
				</Select>
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
