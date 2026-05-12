import type { CustomerOperation, Operations } from "@autumn/shared";
import { AddButton } from "../shared/AddButton";
import { CustomerOperationCard } from "./CustomerOperationCard";

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

	const updateOperations = (customerOperations: CustomerOperation[]) =>
		onChange({ ...value, customer: customerOperations });

	return (
		<div className="flex flex-col">
			{operations.map((operation, index) => (
				<div key={`op-${index}`} className="flex flex-col">
					{index > 0 && <div className="border-t my-3" />}
					<CustomerOperationCard
						value={operation}
						onChange={(updated) => {
							const next = [...operations];
							next[index] = updated;
							updateOperations(next);
						}}
						onRemove={() =>
							updateOperations(operations.filter((_, i) => i !== index))
						}
					/>
				</div>
			))}
			<AddButton
				label="Add Operation"
				onClick={() => updateOperations([...operations, DEFAULT_OPERATION])}
			/>
		</div>
	);
}
