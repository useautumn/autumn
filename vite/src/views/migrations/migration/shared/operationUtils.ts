import type { Operations, UpdatePlanOp } from "@autumn/shared";

export function migrationUid(): string {
	return Date.now().toString(36).slice(-3);
}

export function hasValidOperations(operations: Operations): boolean {
	const ops = operations.customer ?? [];
	if (ops.length === 0) return false;
	return ops.every((op) => {
		if (op.type === "update_plan")
			return op.version !== undefined || hasCustomizations(op.customize);
		if (op.type === "add_plan") return !!op.plan_id;
		return false;
	});
}

export function hasCustomizations(
	customize: UpdatePlanOp["customize"],
): boolean {
	if (!customize) return false;
	if ((customize.add_items?.length ?? 0) > 0) return true;
	if ((customize.remove_items?.length ?? 0) > 0) return true;
	if (customize.price !== undefined) return true;
	if ((customize.upsert_licenses?.length ?? 0) > 0) return true;
	return false;
}

type CustomerOperation = NonNullable<Operations["customer"]>[number];

/** A version without customize swaps every customer item for the target
 * version's catalog, overriding customized plans. */
export function needsVersionOnlyWarning(op: CustomerOperation): boolean {
	return (
		op.type === "update_plan" &&
		op.version !== undefined &&
		!hasCustomizations(op.customize)
	);
}

export function versionOnlyWarningVersions(operations: Operations): number[] {
	const versions = new Set<number>();
	for (const op of operations.customer ?? []) {
		if (op.type === "update_plan" && needsVersionOnlyWarning(op))
			versions.add(op.version as number);
	}
	return [...versions].sort((a, b) => a - b);
}

export function versionWarningText(version: number): string {
	return `This directly sets customers to v${version} and replaces all their items, overriding any customized plans. Combine with customize for a safer operation.`;
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
