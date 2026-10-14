import type { CTEConfig } from "../buildCte.js";
import { CTEBuilder } from "../buildCte.js";
import { inferMode } from "../typeDetection.js";

type QueryStrategy = "correlated" | "join_group_by";

function calculateNestingDepth({
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

function detectArrayRelations({ config }: { config: CTEConfig }): boolean {
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

export function shouldUseJoinStrategy({
	config,
}: {
	config: CTEConfig;
}): boolean {
	if ((config as any).strategy === "join_group_by") return true;
	if ((config as any).strategy === "correlated") return false;

	return false;
}
