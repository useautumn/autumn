import type { CustomerOperation, Operations } from "@autumn/shared";
import { AddButton } from "../shared/AddButton";
import { CustomerOperationCard } from "./CustomerOperationCard";

const DEFAULT_OPERATION: CustomerOperation = {
	type: "update_plan",
	plan_filter: { plan_id: "" },
};

export function OperationsForm({
	value,
	onChange,
}: {
	value: Operations;
	onChange: (value: Operations) => void;
}) {
	const operations = value.customer ?? [];

	const updateOperations = (customerOperations: CustomerOperation[]) =>
		onChange({ ...value, customer: customerOperations });

	return (
		<div className="flex flex-col gap-1">
			{operations.map((operation, index) => (
				<CustomerOperationCard
					key={`op-${index}`}
					value={operation}
					index={index}
					onChange={(updated) => {
						const next = [...operations];
						next[index] = updated;
						updateOperations(next);
					}}
					onRemove={() =>
						updateOperations(operations.filter((_, i) => i !== index))
					}
				/>
			))}
			<AddButton
				label="Add Operation"
				onClick={() => updateOperations([...operations, DEFAULT_OPERATION])}
			/>
		</div>
	);
}
