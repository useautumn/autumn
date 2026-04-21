import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" &&
	value !== null &&
	!Array.isArray(value) &&
	Object.prototype.toString.call(value) === "[object Object]";

/** Recursively merges source into target. Arrays and primitives are replaced, not merged. */
export const deepMerge = <T extends Record<string, unknown>>(
	target: T,
	source: Partial<T>,
): T => {
	const result = { ...target };
	for (const key in source) {
		const sourceValue = source[key];
		const targetValue = result[key];
		if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
			result[key] = deepMerge(
				targetValue as Record<string, unknown>,
				sourceValue as Record<string, unknown>,
			) as T[typeof key];
		} else if (sourceValue !== undefined) {
			result[key] = sourceValue as T[typeof key];
		}
	}
	return result;
};
