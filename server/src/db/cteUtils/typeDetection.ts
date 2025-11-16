import type { SQL } from "drizzle-orm";

export type CTEMode = "array" | "row";

export interface ModeDetectionConfig {
	fieldName?: string;
	limit?: number;
	orderBy?: SQL[];
	through?: unknown;
	mode?: CTEMode;
}

/**
 * Infer whether a CTE should return an array or single row based on config and heuristics
 */
export function inferMode(config: ModeDetectionConfig): CTEMode {
	// 1. Explicit mode always wins
	if (config.mode) {
		return config.mode;
	}

	// 2. Has `through`? → array (many-to-many relationship)
	if (config.through) {
		return "array";
	}

	// 3. Has limit > 1? → array
	if (config.limit !== undefined && config.limit !== 1) {
		return "array";
	}

	// 4. Has orderBy? → probably array (ordering implies multiple results)
	if (config.orderBy && config.orderBy.length > 0) {
		return "array";
	}

	// 5. Plural field name? → array (entities, organizations, products)
	// Exclude words ending in 'ss' (address, process, etc.)
	if (config.fieldName?.endsWith("s") && !config.fieldName.endsWith("ss")) {
		return "array";
	}

	// 6. Default: row (safer default for 1:1 relationships)
	return "row";
}
