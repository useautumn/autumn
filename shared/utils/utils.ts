import { KSUID } from "@owpz/ksuid";
import { Decimal } from "decimal.js";

export const generateId = (prefix?: string): string => {
	const id = KSUID.random().toString();
	return prefix ? `${prefix}_${id}` : id;
};

export const nullish = <T>(
	value: T | null | undefined,
): value is null | undefined => {
	return value === null || value === undefined;
};

export const notNullish = <T>(value: T | null | undefined): value is T =>
	value !== null && value !== undefined;

export const idRegex = /^[a-zA-Z0-9_-]+$/;

export const sumValues = (vals: number[]) => {
	return vals.reduce((acc, curr) => acc.add(curr), new Decimal(0)).toNumber();
};

export const keyToTitle = (
	key: string,
	options?: { exclusionMap?: Record<string, string> },
) => {
	if (options?.exclusionMap?.[key]) {
		return options.exclusionMap[key];
	}
	return key
		.replace(/[-_]/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
};

/** Fast hash using Bun's native hasher */
export const hashString = (str: string): string => {
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(str);
	return hasher.digest("base64");
};

// Types for the result object with discriminated union
type Success<T> = {
	data: T;
	error: null;
};

type Failure<E> = {
	data: null;
	error: E;
};

type Result<T, E = Error> = Success<T> | Failure<E>;

/** Wraps a promise and returns a discriminated union result */
export async function tryCatch<T, E = Error>(
	promise: Promise<T>,
): Promise<Result<T, E>> {
	try {
		const data = await promise;
		return { data, error: null };
	} catch (error) {
		return { data: null, error: error as E };
	}
}

/** Sleep until a specific epoch timestamp (in milliseconds) */
export function sleepUntil(epochMs: number): Promise<void> {
	const now = Date.now();
	const delay = epochMs - now;
	if (delay <= 0) return Promise.resolve();
	return new Promise((resolve) => setTimeout(resolve, delay));
}

export const deduplicateArray = <T>(array: T[]): T[] => {
	return Array.from(new Set(array));
};
