import type { CTEConfig } from "../buildCte.js";
import { CTEBuilder } from "../buildCte.js";
import { inferMode } from "../typeDetection.js";

export type QueryStrategy = "correlated" | "join_group_by";

/**
 * Calculate the maximum nesting depth of a CTE configuration
 */
export function calculateNestingDepth({
	config,
	current = 0,
}: {
	config: CTEConfig;
	current?: number;
}): number {
	if (!config.with) return current;

	let maxDepth = current;
	for (const nested of Object.values(config.with)) {
		const nestedConfig = nested instanceof CTEBuilder ? nested.config : nested;
		const depth = calculateNestingDepth({
			config: nestedConfig,
			current: current + 1,
		});
		maxDepth = Math.max(maxDepth, depth);
	}
	return maxDepth;
}

/**
 * Detect if any nested relations will return arrays (one-to-many)
 */
export function detectArrayRelations({
	config,
}: {
	config: CTEConfig;
}): boolean {
	if (!config.with) return false;

	for (const [fieldName, nested] of Object.entries(config.with)) {
		const nestedConfig = nested instanceof CTEBuilder ? nested.config : nested;
		const mode = inferMode({
			fieldName,
			limit: nestedConfig.limit,
			orderBy: nestedConfig.orderBy,
			through: nestedConfig.through,
			mode: nestedConfig.mode,
		});

		if (mode === "array") return true;
		if (detectArrayRelations({ config: nestedConfig })) return true;
	}
	return false;
}

/**
 * Determine which query strategy to use based on config complexity
 */
export function shouldUseJoinStrategy({
	config,
}: {
	config: CTEConfig;
}): boolean {
	// 1. Explicit strategy override
	if ((config as any).strategy === "join_group_by") return true;
	if ((config as any).strategy === "correlated") return false;

	// 2. Auto detection - TEMPORARILY DISABLED while we fix join condition parsing
	// const depth = calculateNestingDepth({ config });
	// const hasArrayRelations = detectArrayRelations({ config });
	// const isLargeResultSet = config.limit === undefined || config.limit > 50;

	// Use JOIN strategy when:
	// - Deep nesting (2+ levels) with array relations and large result sets
	// - Or very deep nesting (3+ levels) regardless of result set size
	// return (depth >= 2 && hasArrayRelations && isLargeResultSet) || depth >= 3;
	return false; // Temporarily disabled
}
