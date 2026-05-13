import type { CustomerOperation } from "@autumn/shared/api/migrations/operations/customer/index.js";
import { processAddPlan } from "./addPlan/index.js";
import type { OperationProcessor } from "./types/index.js";
import { processUpdatePlan } from "./updatePlan/index.js";

/** Execution order — operations are sorted to match this sequence. */
const EXECUTION_ORDER: CustomerOperation["type"][] = [
	"add_plan",
	"update_plan",
];

const processors: Record<
	CustomerOperation["type"],
	OperationProcessor<CustomerOperation>
> = {
	add_plan: processAddPlan as OperationProcessor<CustomerOperation>,
	update_plan: processUpdatePlan as OperationProcessor<CustomerOperation>,
};

export function getProcessor({
	type,
}: { type: string }): OperationProcessor<CustomerOperation> {
	const processor = processors[type as CustomerOperation["type"]];
	if (!processor)
		throw new Error(`No processor registered for operation type "${type}"`);
	return processor;
}

export function executionPriority({ type }: { type: string }): number {
	const index = EXECUTION_ORDER.indexOf(type as CustomerOperation["type"]);
	return index === -1 ? EXECUTION_ORDER.length : index;
}
