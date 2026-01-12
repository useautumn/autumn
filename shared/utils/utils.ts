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
