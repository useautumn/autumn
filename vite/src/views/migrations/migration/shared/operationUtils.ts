import type { Operations } from "@autumn/shared";

export function hasValidOperations(operations: Operations): boolean {
	const ops = operations.customer ?? [];
	if (ops.length === 0) return false;
	return ops.every((op) => {
		if (op.type === "update_plan")
			return (
				op.version !== undefined || (op.customize && op.customize.length > 0)
			);
		if (op.type === "add_plan") return !!op.plan_id;
		return false;
	});
}

export function getOperationsSummaryText(operations: Operations): string {
	const ops = operations.customer ?? [];
	const updateCount = ops.filter((op) => op.type === "update_plan").length;
	const addCount = ops.filter((op) => op.type === "add_plan").length;
	const parts: string[] = [];
	if (updateCount > 0)
		parts.push(
			`${updateCount} plan ${updateCount === 1 ? "update" : "updates"}`,
		);
	if (addCount > 0)
		parts.push(`${addCount} plan ${addCount === 1 ? "addition" : "additions"}`);
	return parts.join(", ") || "No operations";
}
