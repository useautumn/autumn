import type { SQL } from "drizzle-orm";

export type CTEMode = "array" | "row";

export interface ModeDetectionConfig {
	fieldName?: string;
	limit?: number;
	orderBy?: SQL[];
	through?: unknown;
	mode?: CTEMode;
}

export function inferMode(config: ModeDetectionConfig): CTEMode {
	if (config.mode) {
		return config.mode;
	}

	if (config.through) {
		return "array";
	}

	if (config.limit !== undefined && config.limit !== 1) {
		return "array";
	}

	if (config.orderBy && config.orderBy.length > 0) {
		return "array";
	}

	if (config.fieldName?.endsWith("s") && !config.fieldName.endsWith("ss")) {
		return "array";
	}

	return "row";
}
