import type { CustomerOperation } from "@autumn/shared/api/migrations/operations/customer/index.js";
import { processAddPlan } from "./addPlan/index.js";
import type { OperationProcessor } from "./types/index.js";
import { processUpdatePlan } from "./updatePlan/index.js";

/** Execution order — operations are sorted to match this sequence. */
const EXECUTION_ORDER: CustomerOperation["type"][] = [
	"add_plan",
	"update_plan",
];

export function getProcessor({
	type,
}: {
	type: string;
}): OperationProcessor<CustomerOperation> {
	switch (type as CustomerOperation["type"]) {
		case "add_plan":
			return processAddPlan as OperationProcessor<CustomerOperation>;
		case "update_plan":
			return processUpdatePlan as OperationProcessor<CustomerOperation>;
		default:
			throw new Error(`No processor registered for operation type "${type}"`);
	}
}

export function executionPriority({ type }: { type: string }): number {
	const index = EXECUTION_ORDER.indexOf(type as CustomerOperation["type"]);
	return index === -1 ? EXECUTION_ORDER.length : index;
}
