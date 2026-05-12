import type {
	CustomerOperation,
	Operations,
	UpdatePlanOp,
} from "@autumn/shared";
import { AddButton } from "../shared/AddButton";
import { UpdatePlanOpForm } from "./UpdatePlanOpForm";

const DEFAULT_OPERATION: CustomerOperation = {
	type: "update_plan",
	plan_filter: {},
	version: 1,
};

export function OperationsForm({
	value,
	onChange,
}: {
	value: Operations;
	onChange: (value: Operations) => void;
}) {
	const operations = value.customer ?? [];

	const updateOperations = (next: CustomerOperation[]) =>
		onChange({ ...value, customer: next });

	const updateAt = (index: number, updated: CustomerOperation) => {
		const next = [...operations];
		next[index] = updated;
		updateOperations(next);
	};

	const removeAt = (index: number) =>
		updateOperations(operations.filter((_, i) => i !== index));

	return (
		<div className="flex flex-col">
			{operations.map((operation, index) => (
				<div key={`op-${index}`} className="flex flex-col">
					{index > 0 && <div className="border-t my-3" />}
					{operation.type === "update_plan" && (
						<UpdatePlanOpForm
							value={operation as UpdatePlanOp}
							onChange={(updated) => updateAt(index, updated)}
							onRemove={() => removeAt(index)}
						/>
					)}
				</div>
			))}
			<div className={operations.length > 0 ? "border-t mt-3 pt-3" : ""}>
				<AddButton
					label="Add Operation"
					onClick={() => updateOperations([...operations, DEFAULT_OPERATION])}
				/>
			</div>
		</div>
	);
}
