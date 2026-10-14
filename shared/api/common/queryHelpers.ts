import { z } from "zod/v4";

export function queryStringArray<T extends z.ZodTypeAny>(schema: T) {
	return z.preprocess((val) => {
		if (typeof val === "string") {
			return val.split(",").map((v) => v.trim());
		}
		return val;
	}, z.array(schema));
}

export function queryIntegerArray() {
	return z.preprocess((val) => {
		if (typeof val === "number") {
			return [val];
		}
		if (typeof val === "string") {
			return val.split(",").map((v) => parseInt(v.trim(), 10));
		}
		if (Array.isArray(val)) {
			return val.map((v) => (typeof v === "string" ? parseInt(v, 10) : v));
		}
		return val;
	}, z.array(z.number().int()));
}

export function queryInteger(options?: {
	min?: number;
	max?: number;
	error?: string;
}) {
	let schema = z.number().int({ message: options?.error });

	if (options?.min !== undefined) {
		schema = schema.min(options.min, {
			message: options?.error || `must be at least ${options.min}`,
		});
	}

	if (options?.max !== undefined) {
		schema = schema.max(options.max, {
			message: options?.error || `must be at most ${options.max}`,
		});
	}

	return z.preprocess((val) => {
		if (typeof val === "number") {
			return val;
		}
		if (typeof val === "string") {
			const parsed = Number.parseInt(val, 10);
			return Number.isNaN(parsed) ? val : parsed;
		}
		return val;
	}, schema);
}

export function queryBoolean() {
	return z.preprocess((val) => {
		if (typeof val === "string") {
			if (val === "false" || val === "0") return false;
			if (val === "true" || val === "1") return true;
		}
		return val;
	}, z.boolean());
}
